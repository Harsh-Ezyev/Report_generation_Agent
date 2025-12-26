import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureCycleTallyTable } from "@/lib/query";

export async function POST(request: Request) {
  try {
    await ensureCycleTallyTable();
    const body = await request.json().catch(() => ({}));
    const csvPath: string = body?.csvPath ?? "battery_cycle_counts.csv";

    const fs = await import("fs");
    const path = await import("path");
    const fullPath = path.join(process.cwd(), csvPath);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: `${csvPath} not found` }, { status: 404 });
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.trim().split(/\r?\n/);
    const header = lines.shift();
    if (!header || !header.includes("battery_id") || !header.includes("total_cycles")) {
      return NextResponse.json({ error: "Invalid CSV format" }, { status: 400 });
    }

    let updated = 0;
    for (const line of lines) {
      const [battery_id, _c24, _c7, _c30, total_cycles_str] = line.split(",");
      const total_cycles = parseFloat(total_cycles_str);
      if (!battery_id || Number.isNaN(total_cycles)) continue;

      await query(
        `INSERT INTO cycle_tally (battery_id, total_cycles, last_ts, updated_at)
         VALUES ($1, $2, NULL, NOW())
         ON CONFLICT (battery_id)
         DO UPDATE SET total_cycles = EXCLUDED.total_cycles, updated_at = NOW();`,
        [battery_id, total_cycles]
      );
      updated++;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}