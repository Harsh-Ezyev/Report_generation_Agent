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
  const sql = `
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

  const rows = await query<{
    ts: Date;
    odo: number;
    soc: number;
  }>(sql, [deviceId]);

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
      SELECT device_id,
             SUM(GREATEST(0, COALESCE(prev_soc - battery_soc_pct, 0))) / 100.0 AS cycles
      FROM (
        SELECT device_id,
               ts,
               battery_soc_pct,
               LAG(battery_soc_pct) OVER (PARTITION BY device_id ORDER BY ts) AS prev_soc
        FROM ${TABLE_NAME}
        WHERE battery_soc_pct IS NOT NULL
          AND device_id IS NOT NULL
          AND ts >= NOW() - INTERVAL '${hours} hours'
      ) s
      GROUP BY device_id;
    `;
    const res = await query<{ device_id: string; cycles: number }>(sql);
    return new Map(res.map((r) => [r.device_id, Number((r.cycles || 0).toFixed(3))]));
  };

  const getTotalCyclesSummary = async (): Promise<Map<string, number>> => {
    const sql = `
      SELECT device_id,
             SUM(GREATEST(0, COALESCE(prev_soc - battery_soc_pct, 0))) / 100.0 AS cycles
      FROM (
        SELECT device_id,
               ts,
               battery_soc_pct,
               LAG(battery_soc_pct) OVER (PARTITION BY device_id ORDER BY ts) AS prev_soc
        FROM ${TABLE_NAME}
        WHERE battery_soc_pct IS NOT NULL
          AND device_id IS NOT NULL
      ) s
      GROUP BY device_id;
    `;
    const res = await query<{ device_id: string; cycles: number }>(sql);
    return new Map(res.map((r) => [r.device_id, Number((r.cycles || 0).toFixed(3))]));
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
  const sql = `
    SELECT
      time_bucket('2 hours', ts) AS ts,
      AVG(battery_soc_pct) AS soc
    FROM ${TABLE_NAME}
    WHERE device_id = $1
      AND ts >= NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY 1;
  `;

  const rows = await query<{
    ts: Date;
    soc: number;
  }>(sql, [deviceId]);

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

