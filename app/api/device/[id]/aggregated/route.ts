import { NextResponse } from "next/server";
import { getDeviceAggregated } from "@/lib/query";

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

    const data = await getDeviceAggregated(deviceId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Device aggregated error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch device aggregated data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}