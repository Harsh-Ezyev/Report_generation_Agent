import { query } from "./db";
import { formatInTimeZone } from "date-fns-tz";

// Get table name from env - use it directly like Python code does
// Support schema-qualified names (e.g., "public.iotbms_telemetry")
// Only remove potentially dangerous characters, but preserve dots for schema qualification
const getTableName = (): string => {
  const tableName = process.env.TABLE_NAME || "bms_data";
  
  // If it contains a dot, it's schema-qualified (e.g., "public.iotbms_telemetry")
  if (tableName.includes(".")) {
    const parts = tableName.split(".");
    if (parts.length === 2) {
      // Only sanitize schema and table names (remove SQL injection chars but keep valid identifiers)
      const schema = parts[0].replace(/[^a-zA-Z0-9_]/g, "");
      const table = parts[1].replace(/[^a-zA-Z0-9_]/g, "");
      return `${schema}.${table}`;
    }
  }
  
  // Simple table name - only remove dangerous characters, keep valid PostgreSQL identifiers
  // Allow letters, numbers, underscores, and dots (for schema qualification)
  return tableName.replace(/[^a-zA-Z0-9_.]/g, "");
};

const TABLE_NAME = getTableName();

export interface AggregatedDataPoint {
  ts: string;
  odo: number;
  soc: number;
}

export interface FirstLastRow {
  battery_id: string;
  ts_first: string;
  battery_soc_pct_first: number;
  odo_meter_km_first: number;
  ts_last: string;
  battery_soc_pct_last: number;
  odo_meter_km_last: number;
}

export interface FleetSummary {
  total_batteries: number;
  avg_soc_delta: number;
  worst_soc_delta: number;
  no_odo_batteries: string[];
}

export interface BatteryListItem {
  battery_id: string;
  soc_delta: number;
  odo_delta: number;
}

export interface AnomalyPoint {
  ts: string;
  soc_drop: number;
}

export async function get2hAggregated(batteryId: string): Promise<AggregatedDataPoint[]> {
  const sql = `
    SELECT
      time_bucket('2 hours', ts) AS ts,
      MAX(odo_meter_km) AS odo,
      AVG(battery_soc_pct) AS soc
    FROM ${TABLE_NAME}
    WHERE battery_id = $1
      AND ts >= NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY 1;
  `;

  const rows = await query<{
    ts: Date;
    odo: number;
    soc: number;
  }>(sql, [batteryId]);

  return rows.map((row) => ({
    ts: formatInTimeZone(row.ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
    odo: Number(row.odo) || 0,
    soc: Number(row.soc) || 0,
  }));
}

export async function getFirstLast(): Promise<FirstLastRow[]> {
  const sqlFirst = `
    SELECT DISTINCT ON (battery_id)
      battery_id,
      ts,
      battery_soc_pct,
      odo_meter_km
    FROM ${TABLE_NAME}
    WHERE ts >= NOW() - INTERVAL '24 hours'
    ORDER BY battery_id, ts ASC;
  `;

  const sqlLast = `
    SELECT DISTINCT ON (battery_id)
      battery_id,
      ts,
      battery_soc_pct,
      odo_meter_km
    FROM ${TABLE_NAME}
    WHERE ts >= NOW() - INTERVAL '24 hours'
    ORDER BY battery_id, ts DESC;
  `;

  const firstRows = await query<{
    battery_id: string;
    ts: Date;
    battery_soc_pct: number;
    odo_meter_km: number;
  }>(sqlFirst);

  const lastRows = await query<{
    battery_id: string;
    ts: Date;
    battery_soc_pct: number;
    odo_meter_km: number;
  }>(sqlLast);

  const firstMap = new Map(
    firstRows.map((row) => [
      row.battery_id,
      {
        ts: formatInTimeZone(row.ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
        battery_soc_pct: Number(row.battery_soc_pct) || 0,
        odo_meter_km: Number(row.odo_meter_km) || 0,
      },
    ])
  );

  const lastMap = new Map(
    lastRows.map((row) => [
      row.battery_id,
      {
        ts: formatInTimeZone(row.ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
        battery_soc_pct: Number(row.battery_soc_pct) || 0,
        odo_meter_km: Number(row.odo_meter_km) || 0,
      },
    ])
  );

  const result: FirstLastRow[] = [];
  const allBatteryIds = new Set([...firstMap.keys(), ...lastMap.keys()]);

  for (const batteryId of allBatteryIds) {
    const first = firstMap.get(batteryId);
    const last = lastMap.get(batteryId);

    if (first && last) {
      result.push({
        battery_id: batteryId,
        ts_first: first.ts,
        battery_soc_pct_first: first.battery_soc_pct,
        odo_meter_km_first: first.odo_meter_km,
        ts_last: last.ts,
        battery_soc_pct_last: last.battery_soc_pct,
        odo_meter_km_last: last.odo_meter_km,
      });
    }
  }

  return result;
}

export async function getFleetSummary(): Promise<FleetSummary> {
  const rows = await getFirstLast();

  if (rows.length === 0) {
    return {
      total_batteries: 0,
      avg_soc_delta: 0,
      worst_soc_delta: 0,
      no_odo_batteries: [],
    };
  }

  const deltas = rows.map((row) => ({
    battery_id: row.battery_id,
    soc_delta: row.battery_soc_pct_last - row.battery_soc_pct_first,
    odo_delta: row.odo_meter_km_last - row.odo_meter_km_first,
  }));

  const avgSocDelta =
    deltas.reduce((sum, d) => sum + d.soc_delta, 0) / deltas.length;

  const worstSocDelta = Math.min(...deltas.map((d) => d.soc_delta));

  const noOdoBatteries = deltas
    .filter((d) => d.odo_delta === 0)
    .map((d) => d.battery_id);

  return {
    total_batteries: rows.length,
    avg_soc_delta: Number(avgSocDelta.toFixed(2)),
    worst_soc_delta: Number(worstSocDelta.toFixed(2)),
    no_odo_batteries: noOdoBatteries,
  };
}

export async function getBatteryList(): Promise<BatteryListItem[]> {
  const rows = await getFirstLast();

  return rows.map((row) => ({
    battery_id: row.battery_id,
    soc_delta: Number(
      (row.battery_soc_pct_last - row.battery_soc_pct_first).toFixed(2)
    ),
    odo_delta: Number(
      (row.odo_meter_km_last - row.odo_meter_km_first).toFixed(2)
    ),
  }));
}

export async function getBatteryAggregated(
  batteryId: string
): Promise<AggregatedDataPoint[]> {
  return get2hAggregated(batteryId);
}

export async function getBatteryAnomalies(
  batteryId: string
): Promise<AnomalyPoint[]> {
  const sql = `
    SELECT
      time_bucket('2 hours', ts) AS ts,
      AVG(battery_soc_pct) AS soc
    FROM ${TABLE_NAME}
    WHERE battery_id = $1
      AND ts >= NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY 1;
  `;

  const rows = await query<{
    ts: Date;
    soc: number;
  }>(sql, [batteryId]);

  if (rows.length < 2) {
    return [];
  }

  const dataPoints = rows.map((row) => ({
    ts: formatInTimeZone(row.ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
    soc: Number(row.soc) || 0,
  }));

  const socDrops: number[] = [];
  for (let i = 1; i < dataPoints.length; i++) {
    const drop = dataPoints[i].soc - dataPoints[i - 1].soc;
    socDrops.push(drop);
  }

  if (socDrops.length === 0) {
    return [];
  }

  const mean = socDrops.reduce((sum, d) => sum + d, 0) / socDrops.length;
  const variance =
    socDrops.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) /
    socDrops.length;
  const std = Math.sqrt(variance);
  const threshold = mean - 1.5 * std;

  const anomalies: AnomalyPoint[] = [];

  for (let i = 0; i < socDrops.length; i++) {
    const drop = socDrops[i];
    if (drop < -15 || drop < threshold) {
      anomalies.push({
        ts: dataPoints[i + 1].ts,
        soc_drop: Number(drop.toFixed(2)),
      });
    }
  }

  return anomalies;
}

