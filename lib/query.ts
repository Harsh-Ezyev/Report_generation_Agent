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
  device_id: string;
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
      device_id,
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
      device_id,
      ts,
      battery_soc_pct,
      odo_meter_km
    FROM ${TABLE_NAME}
    WHERE ts >= NOW() - INTERVAL '24 hours'
    ORDER BY battery_id, ts DESC;
  `;

  const firstRows = await query<{
    battery_id: string;
    device_id: string | null;
    ts: Date;
    battery_soc_pct: number;
    odo_meter_km: number;
  }>(sqlFirst);

  const lastRows = await query<{
    battery_id: string;
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
      row.battery_id,
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
      row.battery_id,
      {
        ts: formatInTimeZone(row.ts, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
        battery_soc_pct: Number(row.battery_soc_pct) || 0,
        odo_meter_km: Number(row.odo_meter_km) || 0,
        device_id: row.device_id || null,
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

  // Treat near-zero movement as zero based on rounding to 2 decimals
  const ZERO_EPSILON = 0.005; // values that round to 0.00
  const noOdoBatteries = deltas
    .filter((d) => Math.abs(d.odo_delta) < ZERO_EPSILON)
    .map((d) => d.battery_id);

  return {
    total_batteries: rows.length,
    avg_soc_delta: Number(avgSocDelta.toFixed(2)),
    worst_soc_delta: Number(worstSocDelta.toFixed(2)),
    no_odo_batteries: noOdoBatteries,
  };
}

async function calculateCycles(
  batteryId: string,
  hours: number
): Promise<number> {
  // Validate hours to prevent SQL injection
  const safeHours = Math.max(1, Math.min(8760, Math.floor(hours))); // Clamp between 1 and 8760 (1 year)
  
  const sql = `
    SELECT ts, battery_soc_pct
    FROM ${TABLE_NAME}
    WHERE battery_id = $1
      AND ts >= NOW() - INTERVAL '${safeHours} hours'
      AND battery_soc_pct IS NOT NULL
    ORDER BY ts ASC;
  `;

  const rows = await query<{
    ts: Date;
    battery_soc_pct: number;
  }>(sql, [batteryId]);

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

async function calculateTotalCycles(batteryId: string): Promise<number> {
  const sql = `
    SELECT ts, battery_soc_pct
    FROM ${TABLE_NAME}
    WHERE battery_id = $1
      AND battery_soc_pct IS NOT NULL
    ORDER BY ts ASC;
  `;

  const rows = await query<{
    ts: Date;
    battery_soc_pct: number;
  }>(sql, [batteryId]);

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

export async function getBatteryList(): Promise<BatteryListItem[]> {
  const rows = await getFirstLast();
  await ensureCycleTallyTable();
  const tallyRows = await query<{ battery_id: string; total_cycles: number }>(
    `SELECT battery_id, total_cycles::float AS total_cycles FROM cycle_tally;`
  );
  const tallyMap = new Map<string, number>();
  for (const t of tallyRows) {
    tallyMap.set(t.battery_id, Number(t.total_cycles) || 0);
  }

  const batteryList: BatteryListItem[] = [];

  for (const row of rows) {
    const totalCycles = tallyMap.get(row.battery_id) ?? 0;

    batteryList.push({
      battery_id: row.battery_id,
      device_id: row.device_id || "",
      soc_delta: Number(
        (row.battery_soc_pct_last - row.battery_soc_pct_first).toFixed(2)
      ),
      odo_delta: Number(
        (row.odo_meter_km_last - row.odo_meter_km_first).toFixed(2)
      ),
      cycles_last_24h: 0,
      cycles_last_7d: 0,
      cycles_last_30d: 0,
      total_cycles: Number(totalCycles.toFixed(2)),
    });
  }

  return batteryList;
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


export interface CycleTallyRow {
  battery_id: string;
  total_cycles: number;
  last_ts: string | null;
  updated_at: string;
}

export async function ensureCycleTallyTable(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS cycle_tally (
      battery_id TEXT PRIMARY KEY,
      total_cycles NUMERIC NOT NULL DEFAULT 0,
      last_ts TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await query(sql);
}

export async function getDistinctBatteryIds(): Promise<string[]> {
  const sql = `SELECT DISTINCT battery_id FROM ${TABLE_NAME} WHERE battery_id IS NOT NULL;`;
  const rows = await query<{ battery_id: string }>(sql);
  return rows.map(r => r.battery_id);
}

export async function getMaxTimestamp(batteryId: string): Promise<Date | null> {
  const sql = `SELECT MAX(ts) AS max_ts FROM ${TABLE_NAME} WHERE battery_id = $1;`;
  const rows = await query<{ max_ts: Date | null }>(sql, [batteryId]);
  return rows[0]?.max_ts ?? null;
}

export async function getCycleTally(): Promise<CycleTallyRow[]> {
  await ensureCycleTallyTable();
  const rows = await query<CycleTallyRow>(`SELECT battery_id, total_cycles::float AS total_cycles, last_ts, updated_at FROM cycle_tally ORDER BY battery_id;`);
  return rows;
}

export async function initCycleTallyFromCsv(csvPath: string): Promise<number> {
  await ensureCycleTallyTable();
  // Read CSV and upsert totals
  // Minimal parser: assumes header: battery_id,cycles_last_24h,cycles_last_7d,cycles_last_30d,total_cycles
  const fs = await import("fs");
  const path = await import("path");
  const fullPath = path.join(process.cwd(), csvPath);
  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.trim().split(/\r?\n/);
  const header = lines.shift();
  if (!header || !header.includes("battery_id") || !header.includes("total_cycles")) {
    throw new Error("Invalid CSV format for cycle tally initialization");
  }
  let count = 0;
  for (const line of lines) {
    const [battery_id, _c24, _c7, _c30, total_cycles_str] = line.split(",");
    const total_cycles = parseFloat(total_cycles_str);
    if (!battery_id || Number.isNaN(total_cycles)) continue;
    await query(
      `INSERT INTO cycle_tally (battery_id, total_cycles, last_ts, updated_at)
       VALUES ($1, $2, NULL, NOW())
       ON CONFLICT (battery_id)
       DO UPDATE SET total_cycles = EXCLUDED.total_cycles, updated_at = NOW();`,
      [battery_id, total_cycles]
    );
    count++;
  }
  return count;
}

export async function getCyclesSince(batteryId: string, since: Date): Promise<number> {
  // Fetch SOC series after 'since' and compute EFC increment as sum of positive drops / 100
  const sql = `
    SELECT ts, battery_soc_pct
    FROM ${TABLE_NAME}
    WHERE battery_id = $1 AND ts > $2
    ORDER BY ts ASC;
  `;
  const rows = await query<{ ts: Date; battery_soc_pct: number }>(sql, [batteryId, since]);
  if (rows.length < 2) return 0;
  let prev: number | null = null;
  let dropSum = 0;
  for (const r of rows) {
    const soc = Number(r.battery_soc_pct) || 0;
    if (prev !== null) {
      const drop = Math.max(prev - soc, 0);
      dropSum += drop;
    }
    prev = soc;
  }
  return dropSum / 100;
}

export async function incrementCycleTally(): Promise<{ updated: number }> {
  await ensureCycleTallyTable();
  const batteryIds = await getDistinctBatteryIds();
  let updated = 0;
  for (const batteryId of batteryIds) {
    // Get current tally row
    const existing = await query<CycleTallyRow>(
      `SELECT battery_id, total_cycles::float AS total_cycles, last_ts, updated_at FROM cycle_tally WHERE battery_id = $1;`,
      [batteryId]
    );
    const maxTs = await getMaxTimestamp(batteryId);
    if (!maxTs) continue; // No telemetry

    if (existing.length === 0) {
      // Initialize row with zero and set last_ts to current max to start incremental counting
      await query(
        `INSERT INTO cycle_tally (battery_id, total_cycles, last_ts, updated_at) VALUES ($1, 0, $2, NOW());`,
        [batteryId, maxTs]
      );
      updated++;
      continue;
    }

    const row = existing[0];
    const lastTsStr = row.last_ts;
    const lastTs = lastTsStr ? new Date(lastTsStr) : null;
    if (!lastTs) {
      // No last_ts: just set it to current max to avoid recounting old data
      await query(`UPDATE cycle_tally SET last_ts = $2, updated_at = NOW() WHERE battery_id = $1;`, [batteryId, maxTs]);
      updated++;
      continue;
    }

    if (maxTs <= lastTs) {
      // Nothing new
      continue;
    }

    const inc = await getCyclesSince(batteryId, lastTs);
    if (inc > 0) {
      await query(
        `UPDATE cycle_tally SET total_cycles = total_cycles + $2, last_ts = $3, updated_at = NOW() WHERE battery_id = $1;`,
        [batteryId, inc, maxTs]
      );
      updated++;
    } else {
      // Still update last_ts to max to avoid recounting if no drops occurred
      await query(`UPDATE cycle_tally SET last_ts = $2, updated_at = NOW() WHERE battery_id = $1;`, [batteryId, maxTs]);
    }
  }
  return { updated };
}

