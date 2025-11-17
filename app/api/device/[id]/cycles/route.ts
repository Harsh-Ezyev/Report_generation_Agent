import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const TABLE_NAME = (process.env.TABLE_NAME || "bms_data").replace(/[^a-zA-Z0-9_.]/g, "");

async function calculateCycles(deviceId: string, hours: number): Promise<number> {
  const safeHours = Math.max(1, Math.min(8760, Math.floor(hours)));

  const sql = `
    SELECT ts, battery_soc_pct
    FROM ${TABLE_NAME}
    WHERE device_id = $1
      AND ts >= NOW() - INTERVAL '${safeHours} hours'
      AND battery_soc_pct IS NOT NULL
    ORDER BY ts ASC;
  `;

  const rows = await query<{
    ts: Date;
    battery_soc_pct: number;
  }>(sql, [deviceId]);

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

async function calculateTotalCycles(deviceId: string): Promise<number> {
  const sql = `
    SELECT ts, battery_soc_pct
    FROM ${TABLE_NAME}
    WHERE device_id = $1
      AND battery_soc_pct IS NOT NULL
    ORDER BY ts ASC;
  `;

  const rows = await query<{
    ts: Date;
    battery_soc_pct: number;
  }>(sql, [deviceId]);

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

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const deviceId = params.id;
    if (!deviceId) {
      return NextResponse.json(
        { error: "Device ID is required" },
        { status: 400 }
      );
    }

    const [cycles24h, cycles7d, cycles30d, totalCycles] = await Promise.all([
      calculateCycles(deviceId, 24),
      calculateCycles(deviceId, 168),
      calculateCycles(deviceId, 720),
      calculateTotalCycles(deviceId),
    ]);

    return NextResponse.json({
      cycles_last_24h: cycles24h,
      cycles_last_7d: cycles7d,
      cycles_last_30d: cycles30d,
      total_cycles: totalCycles,
    });
  } catch (error) {
    console.error("Device cycles error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch device cycles",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}