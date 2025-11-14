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

interface BatteryMetrics {
  soc_delta: number;
  odo_delta: number;
  anomaly_count: number;
}

export default function BatteryDetailPage() {
  const params = useParams();
  const batteryId = params.id as string;

  const { data: aggregated, error: aggregatedError, isLoading: aggregatedLoading } = useSWR<AggregatedDataPoint[]>(
    batteryId ? `/api/battery/${encodeURIComponent(batteryId)}/aggregated` : null,
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: anomalies, error: anomaliesError, isLoading: anomaliesLoading } = useSWR<AnomalyPoint[]>(
    batteryId ? `/api/battery/${encodeURIComponent(batteryId)}/anomalies` : null,
    fetcher,
    { refreshInterval: 300000 }
  );

  const metrics: BatteryMetrics = aggregated && aggregated.length > 0
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

  if (aggregatedError || anomaliesError) {
    return (
      <div className="min-h-screen bg-background p-8">
        <ThemeToggle />
        <div className="max-w-7xl mx-auto">
          <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">
            ← Back to Fleet Overview
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-4">Battery Details</h1>
          <p className="text-red-600 dark:text-red-500">Error loading data. Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <ThemeToggle />
      <div className="max-w-7xl mx-auto">
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline mb-4 inline-block">
          ← Back to Fleet Overview
        </Link>

        <h1 className="text-4xl font-bold text-foreground mb-8">
          Battery: {batteryId}
        </h1>

        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>SOC Delta</CardTitle>
              <CardDescription>24h change</CardDescription>
            </CardHeader>
            <CardContent>
              {aggregatedLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-3xl font-bold text-foreground">
                  {metrics.soc_delta.toFixed(2)}%
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ODO Delta</CardTitle>
              <CardDescription>24h change</CardDescription>
            </CardHeader>
            <CardContent>
              {aggregatedLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-3xl font-bold text-foreground">
                  {metrics.odo_delta.toFixed(2)} km
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anomaly Count</CardTitle>
              <CardDescription>Detected anomalies</CardDescription>
            </CardHeader>
            <CardContent>
              {anomaliesLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-3xl font-bold text-red-600 dark:text-red-500">
                  {metrics.anomaly_count}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>SOC vs Time</CardTitle>
              <CardDescription>2-hour aggregated</CardDescription>
            </CardHeader>
            <CardContent>
              {aggregatedLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                    <XAxis
                      dataKey="ts"
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: "12px" }}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--foreground))",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="soc"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      name="SOC (%)"
                      animationDuration={1000}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ODO vs Time</CardTitle>
              <CardDescription>2-hour aggregated</CardDescription>
            </CardHeader>
            <CardContent>
              {aggregatedLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                    <XAxis
                      dataKey="ts"
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: "12px" }}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--foreground))",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="odo"
                      stroke="#eab308"
                      strokeWidth={2}
                      dot={false}
                      name="ODO (km)"
                      animationDuration={1000}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Anomalies</CardTitle>
            <CardDescription>Detected SOC drops (IST timezone)</CardDescription>
          </CardHeader>
          <CardContent>
            {anomaliesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : anomalies && anomalies.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp (IST)</TableHead>
                    <TableHead>SOC Drop (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.map((anomaly, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        {format(parseISO(anomaly.ts), "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-red-600 dark:text-red-500 font-semibold">
                        {anomaly.soc_drop.toFixed(2)}%
                      </TableCell>
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
          <CardContent className="pt-6">
            <Button
              className="w-full"
              onClick={() => {
                window.open(`/api/pdf-report/${encodeURIComponent(batteryId)}`, "_blank");
              }}
            >
              Download PDF Report
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

