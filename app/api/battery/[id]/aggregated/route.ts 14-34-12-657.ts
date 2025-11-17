import { NextResponse } from "next/server";
import { getBatteryAggregated } from "@/lib/query";

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

    const data = await getBatteryAggregated(batteryId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Battery aggregated error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch battery aggregated data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

