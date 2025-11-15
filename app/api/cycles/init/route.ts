import { NextResponse } from "next/server";
import { initCycleTallyFromCsv, getCycleTally } from "@/lib/query";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const csvPath: string = body?.csvPath ?? "battery_cycle_counts.csv";
    const initialized = await initCycleTallyFromCsv(csvPath);
    const data = await getCycleTally();
    return NextResponse.json({ initialized, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}