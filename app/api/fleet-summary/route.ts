import { NextResponse } from "next/server";
import { getFleetSummary, getDeviceList } from "@/lib/query";
import { getSessionWithRole, filterDevicesByRole } from "@/lib/auth-utils";

export async function GET() {
  try {
    const session = await getSessionWithRole();
    
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get all devices and filter based on role
    const allDevices = await getDeviceList();
    const filteredDevices = filterDevicesByRole(
      allDevices,
      session.role,
      session.clientId
    );

    // Calculate summary from filtered devices
    if (filteredDevices.length === 0) {
      return NextResponse.json({
        total_devices: 0,
        avg_soc_delta: 0,
        worst_soc_delta: 0,
        no_odo_devices: [],
      });
    }

    const socDeltas = filteredDevices.map((d) => d.soc_delta);
    const avgSocDelta = socDeltas.reduce((sum, d) => sum + d, 0) / socDeltas.length;
    const worstSocDelta = Math.min(...socDeltas);
    
    const ZERO_EPSILON = 0.005;
    const noOdoDevices = filteredDevices
      .filter((d) => Math.abs(d.odo_delta) < ZERO_EPSILON)
      .map((d) => d.device_id);

    return NextResponse.json({
      total_devices: filteredDevices.length,
      avg_soc_delta: Number(avgSocDelta.toFixed(2)),
      worst_soc_delta: Number(worstSocDelta.toFixed(2)),
      no_odo_devices: noOdoDevices,
    });
  } catch (error) {
    console.error("Fleet summary error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch fleet summary",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
