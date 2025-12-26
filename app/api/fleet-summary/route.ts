import { NextResponse } from "next/server";
import { getFleetSummary } from "@/lib/query";

export async function GET() {
  try {
    const summary = await getFleetSummary();
    return NextResponse.json(summary);
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
