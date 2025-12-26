import { NextResponse } from "next/server";
import { getDeviceList } from "@/lib/query";
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

    const allDevices = await getDeviceList();
    
    // Filter devices based on user role
    const filteredDevices = filterDevicesByRole(
      allDevices,
      session.role,
      session.clientId
    );

    return NextResponse.json(filteredDevices);
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