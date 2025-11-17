import { NextResponse } from "next/server";
import { getBatteryList } from "@/lib/query";

export async function GET() {
  try {
    const batteries = await getBatteryList();
    return NextResponse.json(batteries);
  } catch (error) {
    console.error("Batteries list error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch batteries list",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

