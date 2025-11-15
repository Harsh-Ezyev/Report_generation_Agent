import { NextResponse } from "next/server";
import { ensureCycleTallyTable, getCycleTally } from "@/lib/query";

export async function GET() {
  try {
    await ensureCycleTallyTable();
    const data = await getCycleTally();
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}