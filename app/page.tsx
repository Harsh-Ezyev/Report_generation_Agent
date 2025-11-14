"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { BatteryListItem } from "@/lib/query";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";

interface FleetSummary {
  total_batteries: number;
  avg_soc_delta: number;
  worst_soc_delta: number;
  no_odo_batteries: string[];
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

function getBatteryStatus(battery: BatteryListItem, noOdoBatteries: string[]): {
  status: BatteryStatus;
  color: string;
  bgColor: string;
  label: string;
} {
  if (noOdoBatteries.includes(battery.battery_id)) {
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
  const { data: summary, error: summaryError, isLoading: summaryLoading } = useSWR<FleetSummary>(
    "/api/fleet-summary",
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: batteries, error: batteriesError, isLoading: batteriesLoading } = useSWR<BatteryListItem[]>(
    "/api/batteries",
    fetcher,
    { refreshInterval: 300000 }
  );

  // Group batteries by status
  const groupedBatteries = React.useMemo(() => {
    if (!Array.isArray(batteries) || batteries.length === 0) {
      return { red: [], orange: [], green: [] };
    }

    const red: BatteryListItem[] = [];
    const orange: BatteryListItem[] = [];
    const green: BatteryListItem[] = [];

    batteries.forEach((battery) => {
      const status = getBatteryStatus(battery, summary?.no_odo_batteries || []);
      if (status.status === "red") {
        red.push(battery);
      } else if (status.status === "orange") {
        orange.push(battery);
      } else {
        green.push(battery);
      }
    });

    return { red, orange, green };
  }, [batteries, summary?.no_odo_batteries]);

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
        <h1 className="text-4xl font-bold text-foreground mb-8">Fleet Overview</h1>

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
                <CardTitle>Total Batteries</CardTitle>
                <CardDescription>Active in last 24h</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{summary?.total_batteries || 0}</p>
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
                <CardDescription>Batteries with zero change</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-600 dark:text-red-500">
                  {summary?.no_odo_batteries?.length || 0}
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
              <CardTitle>Battery List</CardTitle>
              <CardDescription>Loading batteries...</CardDescription>
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
                  <CardDescription>Batteries with zero odometer change</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Battery ID</TableHead>
                        <TableHead>SOC Delta (%)</TableHead>
                        <TableHead>ODO Delta (km)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedBatteries.red.map((battery) => {
                        const status = getBatteryStatus(battery, summary?.no_odo_batteries || []);
                        return (
                          <TableRow key={battery.battery_id} className={status.bgColor}>
                            <TableCell className="font-medium">{battery.battery_id}</TableCell>
                            <TableCell>{battery.soc_delta.toFixed(2)}</TableCell>
                            <TableCell>{battery.odo_delta.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={status.color}>{status.label}</span>
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/battery/${encodeURIComponent(battery.battery_id)}`}
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
                  <CardDescription>Batteries with minimal odometer change (&lt; 0.1 km)</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Battery ID</TableHead>
                        <TableHead>SOC Delta (%)</TableHead>
                        <TableHead>ODO Delta (km)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedBatteries.orange.map((battery) => {
                        const status = getBatteryStatus(battery, summary?.no_odo_batteries || []);
                        return (
                          <TableRow key={battery.battery_id} className={status.bgColor}>
                            <TableCell className="font-medium">{battery.battery_id}</TableCell>
                            <TableCell>{battery.soc_delta.toFixed(2)}</TableCell>
                            <TableCell>{battery.odo_delta.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={status.color}>{status.label}</span>
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/battery/${encodeURIComponent(battery.battery_id)}`}
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
                </CardContent>
              </Card>
            )}

            {/* Green Section - Normal */}
            {groupedBatteries.green.length > 0 && (
              <Card className="border-green-200 dark:border-green-500/20">
                <CardHeader>
                  <CardTitle className="text-green-600 dark:text-green-500">
                    🟢 Normal Batteries ({groupedBatteries.green.length})
                  </CardTitle>
                  <CardDescription>Batteries with normal odometer movement</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Battery ID</TableHead>
                        <TableHead>SOC Delta (%)</TableHead>
                        <TableHead>ODO Delta (km)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedBatteries.green.map((battery) => {
                        const status = getBatteryStatus(battery, summary?.no_odo_batteries || []);
                        return (
                          <TableRow key={battery.battery_id} className={status.bgColor}>
                            <TableCell className="font-medium">{battery.battery_id}</TableCell>
                            <TableCell>{battery.soc_delta.toFixed(2)}</TableCell>
                            <TableCell>{battery.odo_delta.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={status.color}>{status.label}</span>
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/battery/${encodeURIComponent(battery.battery_id)}`}
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
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                    No batteries found
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

