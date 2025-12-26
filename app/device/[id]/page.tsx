"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { parseISO } from "date-fns";
import Link from "next/link";
import { AggregatedDataPoint, AnomalyPoint } from "@/lib/query";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || `Failed to fetch ${url}`);
  }
  return res.json();
};

interface DeviceMetrics {
  soc_delta: number;
  odo_delta: number;
  anomaly_count: number;
}

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = params.id as string;

  const { data: aggregated, error: aggregatedError, isLoading: aggregatedLoading } = useSWR<AggregatedDataPoint[]>(
    deviceId ? `/api/device/${encodeURIComponent(deviceId)}/aggregated` : null,
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: anomalies, error: anomaliesError, isLoading: anomaliesLoading } = useSWR<AnomalyPoint[]>(
    deviceId ? `/api/device/${encodeURIComponent(deviceId)}/anomalies` : null,
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: cycles, error: cyclesError, isLoading: cyclesLoading } = useSWR<{
    cycles_last_24h: number;
    cycles_last_7d: number;
    cycles_last_30d: number;
    total_cycles: number;
  }>(
    deviceId ? `/api/device/${encodeURIComponent(deviceId)}/cycles` : null,
    fetcher,
    { refreshInterval: 300000 }
  );

  const metrics: DeviceMetrics = aggregated && aggregated.length > 0
    ? {
        soc_delta: aggregated[aggregated.length - 1].soc - aggregated[0].soc,
        odo_delta: aggregated[aggregated.length - 1].odo - aggregated[0].odo,
        anomaly_count: anomalies?.length || 0,
      }
    : {
        soc_delta: 0,
        odo_delta: 0,
        anomaly_count: 0,
      };

  const chartData = aggregated?.map((point) => ({
    ts: format(parseISO(point.ts), "HH:mm"),
    soc: Number(point.soc.toFixed(2)),
    odo: Number(point.odo.toFixed(2)),
  })) || [];

  if (aggregatedError || anomaliesError || cyclesError) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <ThemeToggle />
          <h1 className="text-3xl font-bold text-foreground mb-4">Device Details</h1>
          <p className="text-red-500">Error loading data. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <ThemeToggle />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground">Device: {deviceId}</h1>
          <Button asChild>
            <Link href="/inventory">Back to Inventory</Link>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>SOC and ODO Over Time</CardTitle>
              <CardDescription>Aggregated in 2-hour buckets</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              {aggregatedLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ts" />
                    <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                    <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="soc" stroke="#8884d8" name="SOC (%)" />
                    <Line yAxisId="right" type="monotone" dataKey="odo" stroke="#82ca9d" name="ODO (km)" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metrics</CardTitle>
              <CardDescription>Last 24 hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">SOC Delta</span>
                <span className="font-semibold">{metrics.soc_delta.toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ODO Delta</span>
                <span className="font-semibold">{metrics.odo_delta.toFixed(2)} km</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Anomalies</span>
                <span className="font-semibold">{metrics.anomaly_count}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Anomalies</CardTitle>
            <CardDescription>Detected SOC drop anomalies</CardDescription>
          </CardHeader>
          <CardContent>
            {anomaliesLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : Array.isArray(anomalies) && anomalies.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>SOC Drop (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.map((anom) => (
                    <TableRow key={anom.ts}>
                      <TableCell>{format(parseISO(anom.ts), "yyyy-MM-dd HH:mm")}</TableCell>
                      <TableCell className="text-red-600 dark:text-red-500">{anom.soc_drop.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground">No anomalies detected</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cycles</CardTitle>
            <CardDescription>Estimated charge cycles</CardDescription>
          </CardHeader>
          <CardContent>
            {cyclesLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : cycles ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Last 24h</p>
                  <p className="text-xl font-semibold">{cycles.cycles_last_24h.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last 7d</p>
                  <p className="text-xl font-semibold">{cycles.cycles_last_7d.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last 30d</p>
                  <p className="text-xl font-semibold">{cycles.cycles_last_30d.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-xl font-semibold">{cycles.total_cycles.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No cycle data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}