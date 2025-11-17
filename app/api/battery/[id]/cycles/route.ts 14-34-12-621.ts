import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { formatInTimeZone } from "date-fns-tz";
import { ensureCycleTallyTable } from "@/lib/query";

const TABLE_NAME = (process.env.TABLE_NAME || "bms_data").replace(/[^a-zA-Z0-9_.]/g, "");

async function calculateCycles(batteryId: string, hours: number): Promise<number> {
  const safeHours = Math.max(1, Math.min(8760, Math.floor(hours)));
  
  const sql = `
    SELECT ts, battery_soc_pct
    FROM ${TABLE_NAME}
    WHERE battery_id = $1
      AND ts >= NOW() - INTERVAL '${safeHours} hours'
      AND battery_soc_pct IS NOT NULL
    ORDER BY ts ASC;
  `;

  const rows = await query<{
    ts: Date;
    battery_soc_pct: number;
  }>(sql, [batteryId]);

  if (rows.length < 2) {
    return 0;
  }

  let totalDrop = 0;
  for (let i = 1; i < rows.length; i++) {
    const prevSoc = Number(rows[i - 1].battery_soc_pct) || 0;
    const currSoc = Number(rows[i].battery_soc_pct) || 0;
    const drop = Math.max(0, prevSoc - currSoc);
    totalDrop += drop;
  }

  return Number((totalDrop / 100).toFixed(3));
}

async function getTotalCyclesFromTally(batteryId: string): Promise<number> {
  await ensureCycleTallyTable();
  const rows = await query<{ total_cycles: number }>(
    `SELECT total_cycles::float AS total_cycles FROM cycle_tally WHERE battery_id = $1;`,
    [batteryId]
  );
  const val = rows[0]?.total_cycles ?? 0;
  return Number((Number(val) || 0).toFixed(2));
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const batteryId = params.id;
    if (!batteryId) {
      return NextResponse.json(
        { error: "Battery ID is required" },
        { status: 400 }
      );
    }

    const [cycles24h, cycles7d, cycles30d, totalCycles] = await Promise.all([
      calculateCycles(batteryId, 24),
      calculateCycles(batteryId, 168), // 7 days
      calculateCycles(batteryId, 720), // 30 days
      getTotalCyclesFromTally(batteryId),
    ]);

    return NextResponse.json({
      cycles_last_24h: cycles24h,
      cycles_last_7d: cycles7d,
      cycles_last_30d: cycles30d,
      total_cycles: totalCycles,
    });
  } catch (error) {
    console.error("Battery cycles error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch battery cycles",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

