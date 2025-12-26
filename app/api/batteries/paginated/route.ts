import { NextRequest, NextResponse } from "next/server";
import { getPaginatedBatteryList } from "@/lib/query";

/**
 * Paginated Battery Monitoring API
 * 
 * GET /api/batteries/paginated?page=1&page_size=20
 * 
 * Returns batteries with anomaly-first prioritization:
 * - Anomalous batteries always appear first across all pages
 * - Normal batteries only appear after all anomalies are exhausted
 * - Stable pagination (no reordering between refreshes)
 * 
 * Query Parameters:
 * - page: Page number (default: 1, min: 1)
 * - page_size: Items per page (default: 20, min: 1, max: 100)
 * 
 * Response:
 * {
 *   items: PaginatedBatteryItem[],
 *   pagination: {
 *     page: number,
 *     page_size: number,
 *     total_items: number,
 *     total_pages: number,
 *     has_next: boolean,
 *     has_previous: boolean,
 *     anomaly_count: number,
 *     normal_count: number
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("page_size") || "20", 10);

    // Validate parameters
    if (isNaN(page) || page < 1) {
      return NextResponse.json(
        { error: "Invalid page parameter. Must be a positive integer." },
        { status: 400 }
      );
    }

    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        { error: "Invalid page_size parameter. Must be between 1 and 100." },
        { status: 400 }
      );
    }

    const result = await getPaginatedBatteryList(page, pageSize);

    // Add cache headers for better performance
    // Cache for 30 seconds to reduce database load while keeping data relatively fresh
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Paginated batteries API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch paginated batteries",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

