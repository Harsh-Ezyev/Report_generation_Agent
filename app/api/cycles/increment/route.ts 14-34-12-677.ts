import { NextResponse } from "next/server";
import { incrementCycleTally, getCycleTally } from "@/lib/query";

export async function POST() {
  try {
    const { updated } = await incrementCycleTally();
    const data = await getCycleTally();
    return NextResponse.json({ updated, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}