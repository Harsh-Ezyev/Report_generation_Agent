"use client";

import React, { useState, useCallback } from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { PaginatedBatteryItem, PaginatedBatteryResponse } from "@/lib/query";
import { AlertTriangle, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || `Failed to fetch ${url}`);
  }
  return res.json();
};

/**
 * Get anomaly badge styling based on severity
 */
function getAnomalyBadge(hasAnomaly: boolean, severity: 'high' | 'medium' | 'low' | null) {
  if (!hasAnomaly) {
    return {
      icon: CheckCircle2,
      label: "Normal",
      color: "text-green-600 dark:text-green-500",
      bgColor: "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20",
      iconColor: "text-green-600 dark:text-green-500",
    };
  }

  switch (severity) {
    case 'high':
      return {
        icon: AlertTriangle,
        label: "High Severity",
        color: "text-red-600 dark:text-red-500",
        bgColor: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20",
        iconColor: "text-red-600 dark:text-red-500",
      };
    case 'medium':
      return {
        icon: AlertCircle,
        label: "Medium Severity",
        color: "text-orange-600 dark:text-orange-500",
        bgColor: "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20",
        iconColor: "text-orange-600 dark:text-orange-500",
      };
    case 'low':
      return {
        icon: AlertCircle,
        label: "Low Severity",
        color: "text-yellow-600 dark:text-yellow-500",
        bgColor: "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:bg-yellow-500/20",
        iconColor: "text-yellow-600 dark:text-yellow-500",
      };
    default:
      return {
        icon: AlertCircle,
        label: "Anomaly Detected",
        color: "text-gray-600 dark:text-gray-500",
        bgColor: "bg-gray-50 dark:bg-gray-500/10 border-gray-200 dark:bg-gray-500/20",
        iconColor: "text-gray-600 dark:text-gray-500",
      };
  }
}

export default function BatteriesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, error, isLoading, mutate } = useSWR<PaginatedBatteryResponse>(
    `/api/batteries/paginated?page=${page}&page_size=${pageSize}`,
    fetcher,
    {
      refreshInterval: 60000, // Refresh every minute
      revalidateOnFocus: true,
    }
  );

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1); // Reset to first page when page size changes
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <ThemeToggle />
          <h1 className="text-3xl font-bold text-foreground mb-4">Battery Monitoring Dashboard</h1>
          <Card className="border-red-200 dark:border-red-500/20">
            <CardContent className="pt-6">
              <p className="text-red-500">Error loading batteries: {error.message}</p>
              <Button onClick={() => mutate()} className="mt-4">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const pagination = data?.pagination;
  const items = data?.items || [];

  return (
    <div className="min-h-screen bg-background p-8">
      <ThemeToggle />
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Battery Monitoring Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Anomaly-first paginated view of all batteries
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/">Fleet Overview</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/inventory">Inventory</Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : pagination ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Total Batteries</CardTitle>
                <CardDescription>Active in last 24h</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{pagination.total_items}</p>
              </CardContent>
            </Card>

            <Card className="border-red-200 dark:border-red-500/20">
              <CardHeader>
                <CardTitle className="text-red-600 dark:text-red-500">Anomalies Detected</CardTitle>
                <CardDescription>Batteries with issues</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-600 dark:text-red-500">
                  {pagination.anomaly_count}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {pagination.anomaly_count > 0
                    ? `${((pagination.anomaly_count / pagination.total_items) * 100).toFixed(1)}% of total`
                    : "All systems normal"}
                </p>
              </CardContent>
            </Card>

            <Card className="border-green-200 dark:border-green-500/20">
              <CardHeader>
                <CardTitle className="text-green-600 dark:text-green-500">Normal Batteries</CardTitle>
                <CardDescription>No issues detected</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600 dark:text-green-500">
                  {pagination.normal_count}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Page</CardTitle>
                <CardDescription>Viewing page {pagination.page} of {pagination.total_pages}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {items.length} / {pagination.total_items}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>View Controls</CardTitle>
            <CardDescription>Adjust pagination settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Page Size:</label>
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
                  disabled={isLoading}
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={isLoading || !pagination?.has_previous}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={isLoading || !pagination?.has_previous}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  Page {pagination?.page || 0} of {pagination?.total_pages || 0}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={isLoading || !pagination?.has_next}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination?.total_pages || 1)}
                  disabled={isLoading || !pagination?.has_next}
                >
                  Last
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => mutate()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  "Refresh"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Battery Table */}
        {isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Batteries</CardTitle>
              <CardDescription>Loading batteries...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : items.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Battery List</CardTitle>
              <CardDescription>
                Showing {items.length} batteries (anomalies prioritized)
                {pagination && pagination.anomaly_count > 0 && (
                  <span className="ml-2 text-red-600 dark:text-red-500">
                    • {items.filter((i) => i.has_anomaly).length} with anomalies on this page
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Battery ID</TableHead>
                      <TableHead>SOC Delta (%)</TableHead>
                      <TableHead>ODO Delta (km)</TableHead>
                      <TableHead>Total Cycles</TableHead>
                      <TableHead>Anomaly Info</TableHead>
                      <TableHead>Last Update</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((battery) => {
                      const badge = getAnomalyBadge(battery.has_anomaly, battery.anomaly_severity);
                      const Icon = badge.icon;

                      return (
                        <TableRow
                          key={battery.device_id}
                          className={battery.has_anomaly ? badge.bgColor : ""}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 ${badge.iconColor}`} />
                              <span className={badge.color}>{badge.label}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{battery.device_id}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {battery.battery_id || "N/A"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                battery.soc_delta < 0
                                  ? "text-red-600 dark:text-red-500"
                                  : "text-foreground"
                              }
                            >
                              {battery.soc_delta.toFixed(2)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                battery.odo_delta < 0.1
                                  ? "text-orange-600 dark:text-orange-500"
                                  : "text-foreground"
                              }
                            >
                              {battery.odo_delta.toFixed(2)} km
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {battery.total_cycles.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {battery.has_anomaly ? (
                              <div className="text-sm">
                                <div className={badge.color}>
                                  {battery.anomaly_count} anomaly{battery.anomaly_count !== 1 ? "ies" : ""}
                                </div>
                                {battery.last_anomaly_ts && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Last: {new Date(battery.last_anomaly_ts).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">None</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(battery.ts_last).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/device/${encodeURIComponent(battery.device_id)}`}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              View Details
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">No batteries found</p>
            </CardContent>
          </Card>
        )}

        {/* Pagination Footer */}
        {pagination && pagination.total_pages > 1 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {((pagination.page - 1) * pagination.page_size) + 1} to{" "}
                  {Math.min(pagination.page * pagination.page_size, pagination.total_items)} of{" "}
                  {pagination.total_items} batteries
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={!pagination.has_previous}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={!pagination.has_previous}
                  >
                    Previous
                  </Button>
                  <span className="text-sm px-2">
                    Page {pagination.page} of {pagination.total_pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={!pagination.has_next}
                  >
                    Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.total_pages)}
                    disabled={!pagination.has_next}
                  >
                    Last
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

