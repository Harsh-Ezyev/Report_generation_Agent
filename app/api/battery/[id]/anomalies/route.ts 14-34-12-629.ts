import { NextResponse } from "next/server";
import { getBatteryAnomalies } from "@/lib/query";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const batteryId = params.id;
    if (!batteryId) {
      return NextResponse.json(
        { error: "Battery ID is required" },
        { status: 400 }
      );
    }

    const anomalies = await getBatteryAnomalies(batteryId);
    return NextResponse.json(anomalies);
  } catch (error) {
    console.error("Battery anomalies error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch battery anomalies",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

