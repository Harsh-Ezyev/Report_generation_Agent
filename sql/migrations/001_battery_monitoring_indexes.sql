-- ============================================================================
-- Battery Monitoring Dashboard - Database Optimizations
-- ============================================================================
-- 
-- This migration creates indexes and optimizations for the paginated
-- battery monitoring dashboard with anomaly detection.
--
-- Performance Requirements:
-- - Support efficient time-series queries on millions of records
-- - Enable fast anomaly detection on large datasets
-- - Optimize pagination queries
--
-- Run this migration on your TimescaleDB instance before using the
-- paginated dashboard.
-- ============================================================================

-- ============================================================================
-- 1. INDEXES FOR TIME-SERIES QUERIES
-- ============================================================================

-- Primary index for device_id/battery_id lookups with time filtering
-- This is critical for the base data queries
CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts 
ON ${TABLE_NAME} (COALESCE(device_id, battery_id), ts DESC)
WHERE ts >= NOW() - INTERVAL '24 hours';

-- Index for battery_id lookups (if battery_id is used separately)
CREATE INDEX IF NOT EXISTS idx_telemetry_battery_ts 
ON ${TABLE_NAME} (battery_id, ts DESC)
WHERE battery_id IS NOT NULL AND ts >= NOW() - INTERVAL '24 hours';

-- Index for device_id lookups (if device_id is used separately)
CREATE INDEX IF NOT EXISTS idx_telemetry_device_id_ts 
ON ${TABLE_NAME} (device_id, ts DESC)
WHERE device_id IS NOT NULL AND ts >= NOW() - INTERVAL '24 hours';

-- Composite index for SOC-based queries (anomaly detection)
CREATE INDEX IF NOT EXISTS idx_telemetry_soc_ts 
ON ${TABLE_NAME} (COALESCE(device_id, battery_id), ts DESC, battery_soc_pct)
WHERE battery_soc_pct IS NOT NULL AND ts >= NOW() - INTERVAL '24 hours';

-- Index for ODO-based queries (anomaly detection)
CREATE INDEX IF NOT EXISTS idx_telemetry_odo_ts 
ON ${TABLE_NAME} (COALESCE(device_id, battery_id), ts DESC, odo_meter_km)
WHERE odo_meter_km IS NOT NULL AND ts >= NOW() - INTERVAL '24 hours';

-- ============================================================================
-- 2. TIMESCALDB HYPERTABLE OPTIMIZATIONS
-- ============================================================================

-- If the table is a TimescaleDB hypertable, ensure proper chunking
-- This should already be set, but verify with:
-- SELECT * FROM timescaledb_information.hypertables WHERE hypertable_name = 'your_table_name';

-- Optimize compression policy if using compression
-- Adjust the interval based on your data retention needs
-- SELECT add_compression_policy('your_table_name', INTERVAL '7 days');

-- ============================================================================
-- 3. MATERIALIZED VIEW FOR ANOMALY CACHE (OPTIONAL)
-- ============================================================================

-- Optional: Create a materialized view to cache anomaly detection results
-- This can significantly improve performance if anomaly detection is expensive
-- Refresh this view periodically (e.g., every 5-15 minutes) using a cron job
-- or TimescaleDB continuous aggregate

-- Uncomment and customize if you want to use materialized views:
/*
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_battery_anomalies AS
WITH device_data AS (
  SELECT DISTINCT
    COALESCE(device_id, battery_id) AS device_key
  FROM ${TABLE_NAME}
  WHERE ts >= NOW() - INTERVAL '24 hours'
),
aggregated_soc AS (
  SELECT
    COALESCE(device_id, battery_id) AS device_key,
    time_bucket('2 hours', ts) AS bucket_ts,
    AVG(battery_soc_pct) AS avg_soc,
    MAX(odo_meter_km) AS max_odo,
    MIN(odo_meter_km) AS min_odo
  FROM ${TABLE_NAME}
  WHERE ts >= NOW() - INTERVAL '24 hours'
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
    STDDEV(soc_drop) AS std_drop
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
)
SELECT
  device_key,
  COUNT(*) AS anomaly_count,
  MAX(severity) AS max_severity,
  MAX(bucket_ts) AS last_anomaly_ts,
  NOW() AS updated_at
FROM anomaly_flags
GROUP BY device_key;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_mv_battery_anomalies_device_key 
ON mv_battery_anomalies (device_key);

-- Refresh function (call this periodically)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_battery_anomalies;
*/

-- ============================================================================
-- 4. QUERY PERFORMANCE ANALYSIS
-- ============================================================================

-- After creating indexes, analyze the table to update statistics
ANALYZE ${TABLE_NAME};

-- ============================================================================
-- 5. VERIFICATION QUERIES
-- ============================================================================

-- Check if indexes were created successfully
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'your_table_name' 
-- ORDER BY indexname;

-- Check index usage (run after some queries)
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'your_table_name'
-- ORDER BY idx_scan DESC;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 
-- 1. Replace ${TABLE_NAME} with your actual table name before running
--    Example: Replace with 'bms_data' or 'public.iotbms_telemetry'
--
-- 2. Index maintenance:
--    - Indexes will be automatically maintained by PostgreSQL
--    - Monitor index bloat periodically: pg_stat_user_indexes
--    - REINDEX if needed during low-traffic periods
--
-- 3. Query performance:
--    - Use EXPLAIN ANALYZE to verify index usage
--    - Monitor slow query logs
--    - Adjust time intervals based on your data volume
--
-- 4. TimescaleDB specific:
--    - Ensure proper chunking interval (e.g., 1 day, 1 week)
--    - Consider compression for older data
--    - Use continuous aggregates for pre-computed metrics
--
-- 5. Production considerations:
--    - Test indexes on a staging environment first
--    - Monitor disk space (indexes can be large)
--    - Consider partial indexes for time-filtered queries
--    - Use CONCURRENTLY for index creation on production (requires separate command)
--
-- ============================================================================

