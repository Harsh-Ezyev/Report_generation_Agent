import { NextResponse } from "next/server";
import { getDeviceList } from "@/lib/query";

export async function GET() {
  try {
    const devices = await getDeviceList();
    return NextResponse.json(devices);
  } catch (error) {
    console.error("Devices list error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch devices list",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}