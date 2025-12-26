"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { DeviceListItem } from "@/lib/query";
import { useSession } from "next-auth/react";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || `Failed to fetch ${url}`);
  }
  return res.json();
};

type BatteryStatus = "red" | "orange" | "green";

function getBatteryStatus(battery: DeviceListItem): {
  status: BatteryStatus;
  color: string;
  bgColor: string;
  label: string;
} {
  const ZERO_EPSILON = 0.005;

  if (Math.abs(battery.odo_delta) < ZERO_EPSILON) {
    return {
      status: "red",
      color: "text-red-600 dark:text-red-500",
      bgColor: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20",
      label: "No ODO",
    };
  }

  if (battery.odo_delta < 0.1) {
    return {
      status: "orange",
      color: "text-orange-600 dark:text-orange-500",
      bgColor: "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20",
      label: "Low ODO",
    };
  }

  return {
    status: "green",
    color: "text-green-600 dark:text-green-500",
    bgColor: "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20",
    label: "Normal",
  };
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "client";
  const userName = session?.user?.name || "User";
  const isSuperAdmin = userRole === "super_admin";

  const { data: batteries, error, isLoading } = useSWR<DeviceListItem[]>("/api/devices", fetcher, {
    refreshInterval: 300000,
  });

  const [deviceQuery, setDeviceQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | BatteryStatus>("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 20;

  const filtered = React.useMemo(() => {
    if (!Array.isArray(batteries)) return [];

    return batteries.filter((b) => {
      const status = getBatteryStatus(b).status;
      const matchesDevice = deviceQuery.trim()
        ? (b.device_id || "").toLowerCase().includes(deviceQuery.trim().toLowerCase())
        : true;
      const matchesStatus = statusFilter === "all" ? true : status === statusFilter;
      return matchesDevice && matchesStatus;
    });
  }, [batteries, deviceQuery, statusFilter]);

  // Paginate filtered results
  const paginatedItems = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filtered.slice(startIndex, endIndex);
  }, [filtered, currentPage]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [deviceQuery, statusFilter]);

  // Generate serial number based on device_id hash
  const getSerialNumber = React.useCallback((deviceId: string, index: number): string => {
    // Create a consistent serial number from device_id
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      const char = deviceId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Format as SN-XXXXX (5 digit number)
    const serial = Math.abs(hash).toString().padStart(5, '0').slice(0, 5);
    return `SN-${serial}`;
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <ThemeToggle />
          <h1 className="text-3xl font-bold text-foreground mb-4">Inventory Management</h1>
          <p className="text-red-500">Error loading inventory. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <ThemeToggle />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Inventory Management</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Logged in as:</span>
              <Badge variant={isSuperAdmin ? "default" : "secondary"}>
                {userName} {isSuperAdmin ? "(Super Admin)" : "(Client)"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/">Back to Dashboard</Link>
            </Button>
            <LogoutButton />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search and filter by device or battery id</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Device ID</label>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. DEV456"
                  value={deviceQuery}
                  onChange={(e) => setDeviceQuery(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Status</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                >
                  <option value="all">All</option>
                  <option value="red">Non Working (No ODO)</option>
                  <option value="orange">Low ODO</option>
                  <option value="green">Normal</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeviceQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Reset Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
              <CardDescription>Loading devices...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
              <CardDescription>
                Showing {paginatedItems.length} of {filtered.length} items (Page {currentPage} of {totalPages || 1})
                {filtered.length !== (batteries?.length || 0) && ` • Filtered from ${batteries?.length || 0} total`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial No.</TableHead>
                    <TableHead>Device ID</TableHead>
                    <TableHead>SOC Delta (%)</TableHead>
                    <TableHead>ODO Delta (km)</TableHead>
                    <TableHead>Total Cycles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.length > 0 ? (
                    paginatedItems.map((battery, index) => {
                      const status = getBatteryStatus(battery);
                      const globalIndex = (currentPage - 1) * itemsPerPage + index;
                      return (
                        <TableRow key={battery.device_id} className={status.bgColor}>
                          <TableCell className="font-mono text-sm">{getSerialNumber(battery.device_id, globalIndex)}</TableCell>
                          <TableCell className="font-medium">{battery.device_id}</TableCell>
                          <TableCell>{battery.soc_delta.toFixed(2)}</TableCell>
                          <TableCell>{battery.odo_delta.toFixed(2)}</TableCell>
                          <TableCell className="font-semibold">{battery.total_cycles.toFixed(2)}</TableCell>
                          <TableCell>
                            <span className={status.color}>{status.label}</span>
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
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No devices found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} items
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}