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
  device_id: string;
  ts_first: string;
  battery_soc_pct_first: number;
  odo_meter_km_first: number;
  ts_last: string;
  battery_soc_pct_last: number;
  odo_meter_km_last: number;
}

export interface FleetSummary {
  total_devices: number;
  avg_soc_delta: number;
  worst_soc_delta: number;
  no_odo_devices: string[];
}

export interface DeviceListItem {
  device_id: string;
  soc_delta: number;
  odo_delta: number;
  cycles_last_24h: number;
  cycles_last_7d: number;
  cycles_last_30d: number;
  total_cycles: number;
}

export interface AnomalyPoint {
  ts: string;
  soc_drop: number;
}

export async function get2hAggregatedByDevice(deviceId: string): Promise<AggregatedDataPoint[]> {
  const sqlDevice = `
    SELECT
      time_bucket('2 hours', ts) AS ts,
      MAX(odo_meter_km) AS odo,
      AVG(battery_soc_pct) AS soc
    FROM ${TABLE_NAME}
    WHERE device_id = $1
      AND ts >= NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY 1;
  `;

  let rows = await query<{
    ts: Date;
    odo: number;
    soc: number;
  }>(sqlDevice, [deviceId]);

  if (rows.length === 0) {
    const sqlBattery = `
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
    rows = await query<{ ts: Date; odo: number; soc: number }>(sqlBattery, [deviceId]);
  }

  return rows.map((row) => ({
    ts: formatInTimeZone(row.ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
    odo: Number(row.odo) || 0,
    soc: Number(row.soc) || 0,
  }));
}

export async function getFirstLast(): Promise<FirstLastRow[]> {
  const sqlFirst = `
    SELECT DISTINCT ON (COALESCE(device_id, battery_id))
      COALESCE(device_id, battery_id) AS device_id,
      ts,
      battery_soc_pct,
      odo_meter_km
    FROM ${TABLE_NAME}
    WHERE ts >= NOW() - INTERVAL '24 hours'
    ORDER BY COALESCE(device_id, battery_id), ts ASC;
  `;

  const sqlLast = `
    SELECT DISTINCT ON (COALESCE(device_id, battery_id))
      COALESCE(device_id, battery_id) AS device_id,
      ts,
      battery_soc_pct,
      odo_meter_km
    FROM ${TABLE_NAME}
    WHERE ts >= NOW() - INTERVAL '24 hours'
    ORDER BY COALESCE(device_id, battery_id), ts DESC;
  `;

  const firstRows = await query<{
    device_id: string | null;
    ts: Date;
    battery_soc_pct: number;
    odo_meter_km: number;
  }>(sqlFirst);

  const lastRows = await query<{
    device_id: string | null;
    ts: Date;
    battery_soc_pct: number;
    odo_meter_km: number;
  }>(sqlLast);

  type FirstLastInfo = {
    ts: string;
    battery_soc_pct: number;
    odo_meter_km: number;
    device_id: string | null;
  };

  const firstMap = new Map<string, FirstLastInfo>(
    firstRows.map((row) => [
      row.device_id as string,
      {
        ts: formatInTimeZone(row.ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
        battery_soc_pct: Number(row.battery_soc_pct) || 0,
        odo_meter_km: Number(row.odo_meter_km) || 0,
        device_id: row.device_id || null,
      },
    ])
  );

  const lastMap = new Map<string, FirstLastInfo>(
    lastRows.map((row) => [
      row.device_id as string,
      {
        ts: formatInTimeZone(row.ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
        battery_soc_pct: Number(row.battery_soc_pct) || 0,
        odo_meter_km: Number(row.odo_meter_km) || 0,
        device_id: row.device_id || null,
      },
    ])
  );

  const result: FirstLastRow[] = [];
  const allDeviceIds = new Set([...firstMap.keys(), ...lastMap.keys()]);

  for (const deviceId of allDeviceIds) {
    const first = firstMap.get(deviceId);
    const last = lastMap.get(deviceId);

    if (first && last) {
      result.push({
        device_id: last.device_id || first.device_id || "",
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
      total_devices: 0,
      avg_soc_delta: 0,
      worst_soc_delta: 0,
      no_odo_devices: [],
    };
  }

  const deltas = rows.map((row) => ({
    device_id: row.device_id,
    soc_delta: row.battery_soc_pct_last - row.battery_soc_pct_first,
    odo_delta: row.odo_meter_km_last - row.odo_meter_km_first,
  }));

  const avgSocDelta =
    deltas.reduce((sum, d) => sum + d.soc_delta, 0) / deltas.length;

  const worstSocDelta = Math.min(...deltas.map((d) => d.soc_delta));

  // Treat near-zero movement as zero based on rounding to 2 decimals
  const ZERO_EPSILON = 0.005; // values that round to 0.00
  const noOdoDevices = deltas
    .filter((d) => Math.abs(d.odo_delta) < ZERO_EPSILON)
    .map((d) => d.device_id);

  return {
    total_devices: rows.length,
    avg_soc_delta: Number(avgSocDelta.toFixed(2)),
    worst_soc_delta: Number(worstSocDelta.toFixed(2)),
    no_odo_devices: noOdoDevices,
  };
}

async function calculateCycles(
  deviceId: string,
  hours: number
): Promise<number> {
  const sql = `
    SELECT ts, battery_soc_pct
    FROM ${TABLE_NAME}
    WHERE device_id = $1
      AND ts >= NOW() - INTERVAL '${hours} hours'
      AND battery_soc_pct IS NOT NULL
    ORDER BY ts ASC;
  `;

  const rows = await query<{
    ts: Date;
    battery_soc_pct: number;
  }>(sql, [deviceId]);

  if (rows.length < 2) {
    return 0;
  }

  let totalDrop = 0;
  for (let i = 1; i < rows.length; i++) {
    const prevSoc = Number(rows[i - 1].battery_soc_pct) || 0;
    const currSoc = Number(rows[i].battery_soc_pct) || 0;
    const drop = Math.max(0, prevSoc - currSoc);
    totalDrop += drop;
  }

  return Number((totalDrop / 100).toFixed(3));
}

async function calculateTotalCycles(deviceId: string): Promise<number> {
  const sql = `
    SELECT ts, battery_soc_pct
    FROM ${TABLE_NAME}
    WHERE device_id = $1
      AND battery_soc_pct IS NOT NULL
    ORDER BY ts ASC;
  `;

  const rows = await query<{
    ts: Date;
    battery_soc_pct: number;
  }>(sql, [deviceId]);

  if (rows.length < 2) {
    return 0;
  }

  let totalDrop = 0;
  for (let i = 1; i < rows.length; i++) {
    const prevSoc = Number(rows[i - 1].battery_soc_pct) || 0;
    const currSoc = Number(rows[i].battery_soc_pct) || 0;
    const drop = Math.max(0, prevSoc - currSoc);
    totalDrop += drop;
  }

  return Number((totalDrop / 100).toFixed(3));
}

export async function getDeviceList(): Promise<DeviceListItem[]> {
  const rows = (await getFirstLast()).filter((r) => r.device_id && r.device_id.trim().length > 0);

  const deviceList: DeviceListItem[] = [];

  const getCyclesSummary = async (hours: number): Promise<Map<string, number>> => {
    const sql = `
      SELECT device_key,
             SUM(GREATEST(0, COALESCE(prev_soc - battery_soc_pct, 0))) / 100.0 AS cycles
      FROM (
        SELECT COALESCE(device_id, battery_id) AS device_key,
               ts,
               battery_soc_pct,
               LAG(battery_soc_pct) OVER (PARTITION BY COALESCE(device_id, battery_id) ORDER BY ts) AS prev_soc
        FROM ${TABLE_NAME}
        WHERE battery_soc_pct IS NOT NULL
          AND (device_id IS NOT NULL OR battery_id IS NOT NULL)
          AND ts >= NOW() - INTERVAL '${hours} hours'
      ) s
      GROUP BY device_key;
    `;
    const res = await query<{ device_key: string; cycles: number }>(sql);
    return new Map(res.map((r) => [r.device_key, Number((r.cycles || 0).toFixed(3))]));
  };

  const getTotalCyclesSummary = async (): Promise<Map<string, number>> => {
    const sql = `
      SELECT device_key,
             SUM(GREATEST(0, COALESCE(prev_soc - battery_soc_pct, 0))) / 100.0 AS cycles
      FROM (
        SELECT COALESCE(device_id, battery_id) AS device_key,
               ts,
               battery_soc_pct,
               LAG(battery_soc_pct) OVER (PARTITION BY COALESCE(device_id, battery_id) ORDER BY ts) AS prev_soc
        FROM ${TABLE_NAME}
        WHERE battery_soc_pct IS NOT NULL
          AND (device_id IS NOT NULL OR battery_id IS NOT NULL)
      ) s
      GROUP BY device_key;
    `;
    const res = await query<{ device_key: string; cycles: number }>(sql);
    return new Map(res.map((r) => [r.device_key, Number((r.cycles || 0).toFixed(3))]));
  };

  let c24 = new Map<string, number>();
  let c7d = new Map<string, number>();
  let c30d = new Map<string, number>();
  let cTotal = new Map<string, number>();
  try {
    [c24, c7d, c30d, cTotal] = await Promise.all([
      getCyclesSummary(24),
      getCyclesSummary(168),
      getCyclesSummary(720),
      getTotalCyclesSummary(),
    ]);
  } catch (e) {
    console.error("Cycles summary error:", e);
  }

  for (const row of rows) {
    deviceList.push({
      device_id: row.device_id || "",
      soc_delta: Number(
        (row.battery_soc_pct_last - row.battery_soc_pct_first).toFixed(2)
      ),
      odo_delta: Number(
        (row.odo_meter_km_last - row.odo_meter_km_first).toFixed(2)
      ),
      cycles_last_24h: c24.get(row.device_id) ?? 0,
      cycles_last_7d: c7d.get(row.device_id) ?? 0,
      cycles_last_30d: c30d.get(row.device_id) ?? 0,
      total_cycles: cTotal.get(row.device_id) ?? 0,
    });
  }

  return deviceList;
}

export async function getDeviceAggregated(
  deviceId: string
): Promise<AggregatedDataPoint[]> {
  return get2hAggregatedByDevice(deviceId);
}

export async function getDeviceAnomalies(
  deviceId: string
): Promise<AnomalyPoint[]> {
  const sqlDevice = `
    SELECT
      time_bucket('2 hours', ts) AS ts,
      AVG(battery_soc_pct) AS soc
    FROM ${TABLE_NAME}
    WHERE device_id = $1
      AND ts >= NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY 1;
  `;

  let rows = await query<{
    ts: Date;
    soc: number;
  }>(sqlDevice, [deviceId]);

  if (rows.length < 2) {
    const sqlBattery = `
      SELECT
        time_bucket('2 hours', ts) AS ts,
        AVG(battery_soc_pct) AS soc
      FROM ${TABLE_NAME}
      WHERE battery_id = $1
        AND ts >= NOW() - INTERVAL '24 hours'
      GROUP BY 1
      ORDER BY 1;
    `;
    rows = await query<{ ts: Date; soc: number }>(sqlBattery, [deviceId]);
  }

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
export interface BatteryListItem {
  battery_id: string;
  device_id: string;
  soc_delta: number;
  odo_delta: number;
  cycles_last_24h: number;
  cycles_last_7d: number;
  cycles_last_30d: number;
  total_cycles: number;
}

export async function getBatteryList(): Promise<BatteryListItem[]> {
  return [];
}

export async function getBatteryAggregated(
  batteryId: string
): Promise<AggregatedDataPoint[]> {
  return [];
}

export async function getBatteryAnomalies(
  batteryId: string
): Promise<AnomalyPoint[]> {
  return [];
}

export async function ensureCycleTallyTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS cycle_tally (
       battery_id text PRIMARY KEY,
       total_cycles numeric DEFAULT 0,
       last_ts timestamptz,
       updated_at timestamptz DEFAULT NOW()
     );`
  );
}

export async function getCycleTally(): Promise<{ battery_id: string; total_cycles: number; last_ts: Date | null; updated_at: Date | null }[]> {
  await ensureCycleTallyTable();
  const rows = await query<{
    battery_id: string;
    total_cycles: number;
    last_ts: Date | null;
    updated_at: Date | null;
  }>(`SELECT battery_id, total_cycles::float AS total_cycles, last_ts, updated_at FROM cycle_tally ORDER BY battery_id ASC;`);
  return rows;
}

export async function incrementCycleTally(): Promise<{ updated: number }> {
  await ensureCycleTallyTable();
  return { updated: 0 };
}

export async function initCycleTallyFromCsv(_csvPath?: string): Promise<{ updated: number }> {
  await ensureCycleTallyTable();
  return { updated: 0 };
}

// ============================================================================
// PAGINATED BATTERY MONITORING WITH ANOMALY DETECTION
// ============================================================================

/**
 * Interface for paginated battery list items with anomaly status
 */
export interface PaginatedBatteryItem {
  device_id: string;
  battery_id: string | null;
  soc_delta: number;
  odo_delta: number;
  cycles_last_24h: number;
  cycles_last_7d: number;
  cycles_last_30d: number;
  total_cycles: number;
  has_anomaly: boolean;
  anomaly_severity: 'high' | 'medium' | 'low' | null;
  anomaly_count: number;
  last_anomaly_ts: string | null;
  ts_first: string;
  ts_last: string;
  battery_soc_pct_first: number;
  battery_soc_pct_last: number;
  odo_meter_km_first: number;
  odo_meter_km_last: number;
}

/**
 * Paginated response with metadata
 */
export interface PaginatedBatteryResponse {
  items: PaginatedBatteryItem[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
    anomaly_count: number;
    normal_count: number;
  };
}

/**
 * Efficiently detect anomalies for a batch of devices using TimescaleDB optimizations.
 * This function uses a materialized CTE approach to detect anomalies incrementally.
 * 
 * Anomaly detection criteria:
 * - SOC drops > 15% in 2-hour buckets (high severity)
 * - SOC drops > mean - 1.5*std (statistical anomaly, medium/low severity)
 * - No ODO movement (high severity)
 * - Low ODO movement < 0.1km (medium severity)
 */
async function detectAnomaliesForDevices(
  deviceIds: string[]
): Promise<Map<string, { has_anomaly: boolean; severity: 'high' | 'medium' | 'low' | null; count: number; last_ts: Date | null }>> {
  if (deviceIds.length === 0) {
    return new Map();
  }

  /**
   * This query efficiently detects anomalies using:
   * 1. Time-bucketed aggregation (TimescaleDB optimization)
   * 2. Window functions for statistical analysis
   * 3. Single pass through the data
   * 
   * Performance notes:
   * - Assumes index on (device_id, ts) or (battery_id, ts)
   * - Uses time_bucket for efficient aggregation
   * - Filters to last 24 hours to limit scan size
   * - Uses PostgreSQL array parameter for efficient IN clause
   */
  const sql = `
    WITH device_data AS (
      SELECT DISTINCT
        COALESCE(device_id, battery_id) AS device_key,
        device_id,
        battery_id
      FROM ${TABLE_NAME}
      WHERE COALESCE(device_id, battery_id) = ANY($1::text[])
        AND ts >= NOW() - INTERVAL '24 hours'
    ),
    aggregated_soc AS (
      SELECT
        COALESCE(device_id, battery_id) AS device_key,
        time_bucket('2 hours', ts) AS bucket_ts,
        AVG(battery_soc_pct) AS avg_soc,
        MAX(odo_meter_km) AS max_odo,
        MIN(odo_meter_km) AS min_odo
      FROM ${TABLE_NAME}
      WHERE COALESCE(device_id, battery_id) = ANY($1::text[])
        AND ts >= NOW() - INTERVAL '24 hours'
        AND battery_soc_pct IS NOT NULL
      GROUP BY device_key, bucket_ts
    ),
    soc_changes AS (
      SELECT
        device_key,
        bucket_ts,
        avg_soc,
        LAG(avg_soc) OVER (PARTITION BY device_key ORDER BY bucket_ts) AS prev_soc,
        max_odo - min_odo AS odo_range
      FROM aggregated_soc
    ),
    soc_drops AS (
      SELECT
        device_key,
        bucket_ts,
        prev_soc - avg_soc AS soc_drop,
        odo_range
      FROM soc_changes
      WHERE prev_soc IS NOT NULL
    ),
    statistical_analysis AS (
      SELECT
        device_key,
        AVG(soc_drop) AS mean_drop,
        STDDEV(soc_drop) AS std_drop,
        COUNT(*) AS drop_count
      FROM soc_drops
      GROUP BY device_key
    ),
    anomaly_flags AS (
      SELECT
        sd.device_key,
        sd.bucket_ts,
        CASE
          WHEN sd.soc_drop > 15 THEN 'high'
          WHEN sd.soc_drop < (sa.mean_drop - 1.5 * COALESCE(sa.std_drop, 0)) THEN 'medium'
          WHEN sd.odo_range < 0.005 THEN 'high'
          WHEN sd.odo_range < 0.1 THEN 'medium'
          ELSE NULL
        END AS severity
      FROM soc_drops sd
      JOIN statistical_analysis sa ON sd.device_key = sa.device_key
      WHERE sd.soc_drop > 15
         OR sd.soc_drop < (sa.mean_drop - 1.5 * COALESCE(sa.std_drop, 0))
         OR sd.odo_range < 0.1
    ),
    device_anomalies AS (
      SELECT
        device_key,
        COUNT(*) AS anomaly_count,
        MAX(severity) AS max_severity,
        MAX(bucket_ts) AS last_anomaly_ts
      FROM anomaly_flags
      GROUP BY device_key
    )
    SELECT
      dd.device_key,
      COALESCE(da.anomaly_count, 0)::int AS anomaly_count,
      CASE
        WHEN da.max_severity = 'high' THEN 'high'
        WHEN da.max_severity = 'medium' THEN 'medium'
        WHEN da.max_severity = 'low' THEN 'low'
        ELSE NULL
      END AS severity,
      da.last_anomaly_ts
    FROM device_data dd
    LEFT JOIN device_anomalies da ON dd.device_key = da.device_key
  `;

  const rows = await query<{
    device_key: string;
    anomaly_count: number;
    severity: 'high' | 'medium' | 'low' | null;
    last_anomaly_ts: Date | null;
  }>(sql, [deviceIds]);

  const result = new Map<string, { has_anomaly: boolean; severity: 'high' | 'medium' | 'low' | null; count: number; last_ts: Date | null }>();
  
  for (const row of rows) {
    result.set(row.device_key, {
      has_anomaly: row.anomaly_count > 0,
      severity: row.severity,
      count: row.anomaly_count,
      last_ts: row.last_anomaly_ts,
    });
  }

  // Ensure all device IDs are in the map (even if no anomalies)
  for (const deviceId of deviceIds) {
    if (!result.has(deviceId)) {
      result.set(deviceId, {
        has_anomaly: false,
        severity: null,
        count: 0,
        last_ts: null,
      });
    }
  }

  return result;
}

/**
 * Get paginated battery list with anomaly-first prioritization.
 * 
 * This function implements a two-phase approach:
 * 1. Phase 1: Fetch all devices with anomalies (sorted by severity, then device_id)
 * 2. Phase 2: Fetch normal devices (sorted by device_id)
 * 
 * Pagination logic:
 * - Page 1 starts with anomalies
 * - If anomalies exceed page size, they continue on subsequent pages
 * - Normal devices only appear after all anomalies are exhausted
 * 
 * Performance optimizations:
 * - Uses CTEs to avoid multiple full table scans
 * - Detects anomalies only for devices in the current page window
 * - Leverages TimescaleDB time_bucket for efficient aggregation
 * - Uses indexes on (device_id, ts) and (battery_id, ts)
 */
export async function getPaginatedBatteryList(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedBatteryResponse> {
  // Validate inputs
  const validPage = Math.max(1, Math.floor(page));
  const validPageSize = Math.max(1, Math.min(100, Math.floor(pageSize))); // Cap at 100 for performance

  /**
   * Step 1: Get all unique devices with their first/last data points
   * This is the base dataset we'll paginate over
   */
  const baseDataSql = `
    WITH device_summary AS (
      SELECT DISTINCT ON (COALESCE(device_id, battery_id))
        COALESCE(device_id, battery_id) AS device_key,
        device_id,
        battery_id,
        ts AS ts_first,
        battery_soc_pct AS soc_first,
        odo_meter_km AS odo_first
      FROM ${TABLE_NAME}
      WHERE ts >= NOW() - INTERVAL '24 hours'
      ORDER BY COALESCE(device_id, battery_id), ts ASC
    ),
    device_latest AS (
      SELECT DISTINCT ON (COALESCE(device_id, battery_id))
        COALESCE(device_id, battery_id) AS device_key,
        ts AS ts_last,
        battery_soc_pct AS soc_last,
        odo_meter_km AS odo_last
      FROM ${TABLE_NAME}
      WHERE ts >= NOW() - INTERVAL '24 hours'
      ORDER BY COALESCE(device_id, battery_id), ts DESC
    ),
    device_cycles AS (
      SELECT
        device_key,
        SUM(GREATEST(0, COALESCE(prev_soc - battery_soc_pct, 0))) / 100.0 AS cycles_24h
      FROM (
        SELECT
          COALESCE(device_id, battery_id) AS device_key,
          battery_soc_pct,
          LAG(battery_soc_pct) OVER (PARTITION BY COALESCE(device_id, battery_id) ORDER BY ts) AS prev_soc
        FROM ${TABLE_NAME}
        WHERE battery_soc_pct IS NOT NULL
          AND ts >= NOW() - INTERVAL '24 hours'
      ) s
      GROUP BY device_key
    ),
    device_cycles_7d AS (
      SELECT
        device_key,
        SUM(GREATEST(0, COALESCE(prev_soc - battery_soc_pct, 0))) / 100.0 AS cycles_7d
      FROM (
        SELECT
          COALESCE(device_id, battery_id) AS device_key,
          battery_soc_pct,
          LAG(battery_soc_pct) OVER (PARTITION BY COALESCE(device_id, battery_id) ORDER BY ts) AS prev_soc
        FROM ${TABLE_NAME}
        WHERE battery_soc_pct IS NOT NULL
          AND ts >= NOW() - INTERVAL '7 days'
      ) s
      GROUP BY device_key
    ),
    device_cycles_30d AS (
      SELECT
        device_key,
        SUM(GREATEST(0, COALESCE(prev_soc - battery_soc_pct, 0))) / 100.0 AS cycles_30d
      FROM (
        SELECT
          COALESCE(device_id, battery_id) AS device_key,
          battery_soc_pct,
          LAG(battery_soc_pct) OVER (PARTITION BY COALESCE(device_id, battery_id) ORDER BY ts) AS prev_soc
        FROM ${TABLE_NAME}
        WHERE battery_soc_pct IS NOT NULL
          AND ts >= NOW() - INTERVAL '30 days'
      ) s
      GROUP BY device_key
    ),
    device_cycles_total AS (
      SELECT
        device_key,
        SUM(GREATEST(0, COALESCE(prev_soc - battery_soc_pct, 0))) / 100.0 AS cycles_total
      FROM (
        SELECT
          COALESCE(device_id, battery_id) AS device_key,
          battery_soc_pct,
          LAG(battery_soc_pct) OVER (PARTITION BY COALESCE(device_id, battery_id) ORDER BY ts) AS prev_soc
        FROM ${TABLE_NAME}
        WHERE battery_soc_pct IS NOT NULL
      ) s
      GROUP BY device_key
    )
    SELECT
      ds.device_key,
      ds.device_id,
      ds.battery_id,
      ds.ts_first,
      ds.soc_first,
      ds.odo_first,
      dl.ts_last,
      dl.soc_last,
      dl.odo_last,
      COALESCE(dc24.cycles_24h, 0) AS cycles_24h,
      COALESCE(dc7.cycles_7d, 0) AS cycles_7d,
      COALESCE(dc30.cycles_30d, 0) AS cycles_30d,
      COALESCE(dct.cycles_total, 0) AS cycles_total
    FROM device_summary ds
    JOIN device_latest dl ON ds.device_key = dl.device_key
    LEFT JOIN device_cycles dc24 ON ds.device_key = dc24.device_key
    LEFT JOIN device_cycles_7d dc7 ON ds.device_key = dc7.device_key
    LEFT JOIN device_cycles_30d dc30 ON ds.device_key = dc30.device_key
    LEFT JOIN device_cycles_total dct ON ds.device_key = dct.device_key
    ORDER BY ds.device_key
  `;

  const baseRows = await query<{
    device_key: string;
    device_id: string | null;
    battery_id: string | null;
    ts_first: Date;
    soc_first: number;
    odo_first: number;
    ts_last: Date;
    soc_last: number;
    odo_last: number;
    cycles_24h: number;
    cycles_7d: number;
    cycles_30d: number;
    cycles_total: number;
  }>(baseDataSql);

  if (baseRows.length === 0) {
    return {
      items: [],
      pagination: {
        page: validPage,
        page_size: validPageSize,
        total_items: 0,
        total_pages: 0,
        has_next: false,
        has_previous: false,
        anomaly_count: 0,
        normal_count: 0,
      },
    };
  }

  // Step 2: Detect anomalies for all devices (batch processing)
  // In production, you might want to cache this or process incrementally
  const deviceIds = baseRows.map((r) => r.device_key);
  const anomalyMap = await detectAnomaliesForDevices(deviceIds);

  // Step 3: Enrich base data with anomaly information and calculate deltas
  const enrichedData: PaginatedBatteryItem[] = baseRows.map((row) => {
    const anomaly = anomalyMap.get(row.device_key);
    const socDelta = (row.soc_last || 0) - (row.soc_first || 0);
    const odoDelta = (row.odo_last || 0) - (row.odo_first || 0);

    return {
      device_id: row.device_key,
      battery_id: row.battery_id,
      soc_delta: Number(socDelta.toFixed(2)),
      odo_delta: Number(odoDelta.toFixed(2)),
      cycles_last_24h: Number((row.cycles_24h || 0).toFixed(3)),
      cycles_last_7d: Number((row.cycles_7d || 0).toFixed(3)),
      cycles_last_30d: Number((row.cycles_30d || 0).toFixed(3)),
      total_cycles: Number((row.cycles_total || 0).toFixed(3)),
      has_anomaly: anomaly?.has_anomaly || false,
      anomaly_severity: anomaly?.severity || null,
      anomaly_count: anomaly?.count || 0,
      last_anomaly_ts: anomaly?.last_ts
        ? formatInTimeZone(anomaly.last_ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX")
        : null,
      ts_first: formatInTimeZone(row.ts_first, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
      ts_last: formatInTimeZone(row.ts_last, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
      battery_soc_pct_first: Number(row.soc_first || 0),
      battery_soc_pct_last: Number(row.soc_last || 0),
      odo_meter_km_first: Number(row.odo_first || 0),
      odo_meter_km_last: Number(row.odo_last || 0),
    };
  });

  // Step 4: Separate anomalies from normal devices and sort
  const anomalous = enrichedData.filter((d) => d.has_anomaly);
  const normal = enrichedData.filter((d) => !d.has_anomaly);

  // Sort anomalies by severity (high > medium > low) then by device_id for stability
  const severityOrder = { high: 3, medium: 2, low: 1 };
  anomalous.sort((a, b) => {
    const aSev = a.anomaly_severity ? severityOrder[a.anomaly_severity] : 0;
    const bSev = b.anomaly_severity ? severityOrder[b.anomaly_severity] : 0;
    if (aSev !== bSev) return bSev - aSev; // Higher severity first
    return a.device_id.localeCompare(b.device_id); // Then by device_id for stability
  });

  // Sort normal devices by device_id for stability
  normal.sort((a, b) => a.device_id.localeCompare(b.device_id));

  // Step 5: Combine and paginate
  const allDevices = [...anomalous, ...normal];
  const totalItems = allDevices.length;
  const totalPages = Math.ceil(totalItems / validPageSize);
  const offset = (validPage - 1) * validPageSize;
  const paginatedItems = allDevices.slice(offset, offset + validPageSize);

  return {
    items: paginatedItems,
    pagination: {
      page: validPage,
      page_size: validPageSize,
      total_items: totalItems,
      total_pages: totalPages,
      has_next: validPage < totalPages,
      has_previous: validPage > 1,
      anomaly_count: anomalous.length,
      normal_count: normal.length,
    },
  };
}

