import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureCycleTallyTable, getCycleTally } from "@/lib/query";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const battery_id: string | undefined = body?.battery_id;
    const total_cycles: number | undefined = body?.total_cycles;

    if (!battery_id || typeof battery_id !== "string") {
      return NextResponse.json({ error: "battery_id is required" }, { status: 400 });
    }
    if (typeof total_cycles !== "number" || !Number.isFinite(total_cycles) || total_cycles < 0) {
      return NextResponse.json({ error: "total_cycles must be a non-negative number" }, { status: 400 });
    }

    await ensureCycleTallyTable();

    await query(
      `INSERT INTO cycle_tally (battery_id, total_cycles, last_ts, updated_at)
       VALUES ($1, $2, NULL, NOW())
       ON CONFLICT (battery_id)
       DO UPDATE SET total_cycles = EXCLUDED.total_cycles, updated_at = NOW();`,
      [battery_id, total_cycles]
    );

    const data = await getCycleTally();
    return NextResponse.json({ ok: true, battery_id, total_cycles, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}