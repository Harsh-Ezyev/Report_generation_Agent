import { NextResponse } from "next/server";
import { getDeviceAnomalies } from "@/lib/query";

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

    const anomalies = await getDeviceAnomalies(deviceId);
    return NextResponse.json(anomalies);
  } catch (error) {
    console.error("Device anomalies error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch device anomalies",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}