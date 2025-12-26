"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import Link from "next/link";
import { DeviceListItem } from "@/lib/query";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";

interface FleetSummary {
  total_devices: number;
  avg_soc_delta: number;
  worst_soc_delta: number;
  no_odo_devices: string[];
}


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
  // Use an epsilon to treat values that round to 0.00 as zero
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

export default function Home() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "client";
  const userName = session?.user?.name || "User";
  const isSuperAdmin = userRole === "super_admin";

  const { data: summary, error: summaryError, isLoading: summaryLoading } = useSWR<FleetSummary>(
    "/api/fleet-summary",
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: batteries, error: batteriesError, isLoading: batteriesLoading } = useSWR<DeviceListItem[]>(
    "/api/devices",
    fetcher,
    { refreshInterval: 300000 }
  );

  // Pagination state for each section
  const [redPage, setRedPage] = React.useState(1);
  const [orangePage, setOrangePage] = React.useState(1);
  const [greenPage, setGreenPage] = React.useState(1);
  const itemsPerPage = 20;

  // Group batteries by status
  const groupedBatteries = React.useMemo(() => {
    if (!Array.isArray(batteries) || batteries.length === 0) {
      return { red: [], orange: [], green: [] };
    }

    const red: DeviceListItem[] = [];
    const orange: DeviceListItem[] = [];
    const green: DeviceListItem[] = [];

    batteries.forEach((battery) => {
      const status = getBatteryStatus(battery);
      if (status.status === "red") {
        red.push(battery);
      } else if (status.status === "orange") {
        orange.push(battery);
      } else {
        green.push(battery);
      }
    });

    return { red, orange, green };
  }, [batteries]);

  // Paginate each section
  const paginatedRed = React.useMemo(() => {
    const start = (redPage - 1) * itemsPerPage;
    return groupedBatteries.red.slice(start, start + itemsPerPage);
  }, [groupedBatteries.red, redPage]);

  const paginatedOrange = React.useMemo(() => {
    const start = (orangePage - 1) * itemsPerPage;
    return groupedBatteries.orange.slice(start, start + itemsPerPage);
  }, [groupedBatteries.orange, orangePage]);

  const paginatedGreen = React.useMemo(() => {
    const start = (greenPage - 1) * itemsPerPage;
    return groupedBatteries.green.slice(start, start + itemsPerPage);
  }, [groupedBatteries.green, greenPage]);

  const pieData = React.useMemo(() => {
    const workingCount = groupedBatteries.orange.length + groupedBatteries.green.length;
    const nonWorkingCount = groupedBatteries.red.length;

    return [
      {
        name: "Working",
        value: workingCount,
        color: "#22c55e",
      },
      {
        name: "Non Working",
        value: nonWorkingCount,
        color: "#ef4444",
      },
    ];
  }, [groupedBatteries]);

  if (summaryError || batteriesError) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <ThemeToggle />
          <h1 className="text-3xl font-bold text-foreground mb-4">Fleet Overview</h1>
          <p className="text-red-500">Error loading data. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <ThemeToggle />
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Fleet Overview</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Logged in as:</span>
              <Badge variant={isSuperAdmin ? "default" : "secondary"}>
                {userName} {isSuperAdmin ? "(Super Admin)" : "(Client)"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/inventory"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Inventory Management
            </Link>
            <LogoutButton />
          </div>
        </div>

        {summaryLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Total Devices</CardTitle>
                <CardDescription>Active in last 24h</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{summary?.total_devices || 0}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Avg SOC Change</CardTitle>
                <CardDescription>Average delta</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {summary?.avg_soc_delta?.toFixed(2) || "0.00"}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Worst SOC Drop</CardTitle>
                <CardDescription>Minimum delta</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-600 dark:text-red-500">
                  {summary?.worst_soc_delta?.toFixed(2) || "0.00"}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>No ODO Movement</CardTitle>
                <CardDescription>Devices with zero change</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-600 dark:text-red-500">
                  {summary?.no_odo_devices?.length || 0}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          <div className="lg:col-span-2">
            {batteriesLoading ? (
              <Card>
                <CardHeader>
                  <CardTitle>Battery Distribution</CardTitle>
                  <CardDescription>Working vs non working batteries</CardDescription>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full" />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Battery Distribution</CardTitle>
                  <CardDescription>Working vs non working batteries</CardDescription>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--foreground))",
                        }}
                      />
                      <Legend />
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Status Breakdown</CardTitle>
              <CardDescription>Quick view of battery states</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Non Working</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-500">
                    {groupedBatteries.red.length}
                  </p>
                </div>
                <span className="h-3 w-3 rounded-full bg-red-500" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Low ODO</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-500">
                    {groupedBatteries.orange.length}
                  </p>
                </div>
                <span className="h-3 w-3 rounded-full bg-orange-400" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Normal</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-500">
                    {groupedBatteries.green.length}
                  </p>
                </div>
                <span className="h-3 w-3 rounded-full bg-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {batteriesLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Device List</CardTitle>
              <CardDescription>Loading devices...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : Array.isArray(batteries) && batteries.length > 0 ? (
          <div className="space-y-6">
            {/* Red Section - No ODO */}
            {groupedBatteries.red.length > 0 && (
              <Card className="border-red-200 dark:border-red-500/20">
                <CardHeader>
                  <CardTitle className="text-red-600 dark:text-red-500">
                    🔴 No ODO Movement ({groupedBatteries.red.length})
                  </CardTitle>
                  <CardDescription>Devices with zero odometer change</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>SOC Delta (%)</TableHead>
                    <TableHead>ODO Delta (km)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedRed.map((battery) => {
                        const status = getBatteryStatus(battery);
                        return (
                          <TableRow key={battery.device_id} className={status.bgColor}>
                            <TableCell className="font-medium">{battery.device_id}</TableCell>
                            <TableCell>{battery.soc_delta.toFixed(2)}</TableCell>
                            <TableCell>{battery.odo_delta.toFixed(2)}</TableCell>
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
                      })}
                    </TableBody>
                  </Table>
                  {groupedBatteries.red.length > itemsPerPage && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((redPage - 1) * itemsPerPage) + 1} to {Math.min(redPage * itemsPerPage, groupedBatteries.red.length)} of {groupedBatteries.red.length} items
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRedPage(1)}
                          disabled={redPage === 1}
                        >
                          First
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRedPage(redPage - 1)}
                          disabled={redPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm px-2">
                          Page {redPage} of {Math.ceil(groupedBatteries.red.length / itemsPerPage)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRedPage(redPage + 1)}
                          disabled={redPage >= Math.ceil(groupedBatteries.red.length / itemsPerPage)}
                        >
                          Next
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRedPage(Math.ceil(groupedBatteries.red.length / itemsPerPage))}
                          disabled={redPage >= Math.ceil(groupedBatteries.red.length / itemsPerPage)}
                        >
                          Last
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Orange Section - Low ODO */}
            {groupedBatteries.orange.length > 0 && (
              <Card className="border-orange-200 dark:border-orange-500/20">
                <CardHeader>
                  <CardTitle className="text-orange-600 dark:text-orange-500">
                    🟠 Low ODO Movement ({groupedBatteries.orange.length})
                  </CardTitle>
                  <CardDescription>Devices with minimal odometer change (&lt; 0.1 km)</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>SOC Delta (%)</TableHead>
                    <TableHead>ODO Delta (km)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedOrange.map((battery) => {
                        const status = getBatteryStatus(battery);
                        return (
                          <TableRow key={battery.device_id} className={status.bgColor}>
                            <TableCell className="font-medium">{battery.device_id}</TableCell>
                            <TableCell>{battery.soc_delta.toFixed(2)}</TableCell>
                            <TableCell>{battery.odo_delta.toFixed(2)}</TableCell>
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
                      })}
                    </TableBody>
                  </Table>
                  {groupedBatteries.orange.length > itemsPerPage && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((orangePage - 1) * itemsPerPage) + 1} to {Math.min(orangePage * itemsPerPage, groupedBatteries.orange.length)} of {groupedBatteries.orange.length} items
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOrangePage(1)}
                          disabled={orangePage === 1}
                        >
                          First
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOrangePage(orangePage - 1)}
                          disabled={orangePage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm px-2">
                          Page {orangePage} of {Math.ceil(groupedBatteries.orange.length / itemsPerPage)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOrangePage(orangePage + 1)}
                          disabled={orangePage >= Math.ceil(groupedBatteries.orange.length / itemsPerPage)}
                        >
                          Next
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOrangePage(Math.ceil(groupedBatteries.orange.length / itemsPerPage))}
                          disabled={orangePage >= Math.ceil(groupedBatteries.orange.length / itemsPerPage)}
                        >
                          Last
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Green Section - Normal */}
            {groupedBatteries.green.length > 0 && (
              <Card className="border-green-200 dark:border-green-500/20">
                <CardHeader>
                  <CardTitle className="text-green-600 dark:text-green-500">
                    🟢 Normal Devices ({groupedBatteries.green.length})
                  </CardTitle>
                  <CardDescription>Devices with normal odometer movement</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>SOC Delta (%)</TableHead>
                    <TableHead>ODO Delta (km)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedGreen.map((battery) => {
                        const status = getBatteryStatus(battery);
                        return (
                          <TableRow key={battery.device_id} className={status.bgColor}>
                            <TableCell className="font-medium">{battery.device_id}</TableCell>
                            <TableCell>{battery.soc_delta.toFixed(2)}</TableCell>
                            <TableCell>{battery.odo_delta.toFixed(2)}</TableCell>
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
                      })}
                    </TableBody>
                  </Table>
                  {groupedBatteries.green.length > itemsPerPage && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((greenPage - 1) * itemsPerPage) + 1} to {Math.min(greenPage * itemsPerPage, groupedBatteries.green.length)} of {groupedBatteries.green.length} items
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGreenPage(1)}
                          disabled={greenPage === 1}
                        >
                          First
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGreenPage(greenPage - 1)}
                          disabled={greenPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm px-2">
                          Page {greenPage} of {Math.ceil(groupedBatteries.green.length / itemsPerPage)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGreenPage(greenPage + 1)}
                          disabled={greenPage >= Math.ceil(groupedBatteries.green.length / itemsPerPage)}
                        >
                          Next
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGreenPage(Math.ceil(groupedBatteries.green.length / itemsPerPage))}
                          disabled={greenPage >= Math.ceil(groupedBatteries.green.length / itemsPerPage)}
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
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">No devices found</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

