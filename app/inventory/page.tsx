"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { DeviceListItem } from "@/lib/query";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || `Failed to fetch ${url}`);
  }
  return res.json();
};

type BatteryStatus = "red" | "orange" | "green";

function getBatteryStatus(battery: BatteryListItem): {
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
  const { data: batteries, error, isLoading } = useSWR<DeviceListItem[]>("/api/devices", fetcher, {
    refreshInterval: 300000,
  });

  const [deviceQuery, setDeviceQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | BatteryStatus>("all");

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
          <h1 className="text-4xl font-bold text-foreground">Inventory Management</h1>
          <Button asChild>
            <Link href="/">Back to Dashboard</Link>
          </Button>
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
                {filtered.length} of {batteries?.length || 0} items
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>SOC Delta (%)</TableHead>
                    <TableHead>ODO Delta (km)</TableHead>
                    <TableHead>Total Cycles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((battery) => {
                    const status = getBatteryStatus(battery);
                    return (
                      <TableRow key={battery.device_id} className={status.bgColor}>
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
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}