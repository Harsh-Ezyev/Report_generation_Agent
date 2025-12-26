# Database Migrations for Battery Monitoring Dashboard

This directory contains SQL migrations for optimizing the TimescaleDB database for the paginated battery monitoring dashboard.

## Setup Instructions

### 1. Review the Migration File

Open `sql/migrations/001_battery_monitoring_indexes.sql` and replace `${TABLE_NAME}` with your actual table name.

For example:
- If your table is `bms_data`, replace `${TABLE_NAME}` with `bms_data`
- If your table is schema-qualified like `public.iotbms_telemetry`, replace `${TABLE_NAME}` with `public.iotbms_telemetry`

### 2. Run the Migration

#### Option A: Using psql

```bash
# Replace placeholders and run
psql -h your_host -U your_user -d your_database -f sql/migrations/001_battery_monitoring_indexes.sql
```

#### Option B: Using a Database Client

1. Connect to your TimescaleDB instance
2. Open the migration file
3. Replace `${TABLE_NAME}` with your actual table name
4. Execute the SQL statements

#### Option C: Using the Application

You can create a migration script in your application that reads the SQL file and executes it.

### 3. Verify Indexes

After running the migration, verify that indexes were created:

```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'your_table_name' 
ORDER BY indexname;
```

### 4. Monitor Performance

Use `EXPLAIN ANALYZE` on your queries to ensure indexes are being used:

```sql
EXPLAIN ANALYZE
SELECT ... -- your query here
```

## Index Strategy

The migration creates the following indexes:

1. **idx_telemetry_device_ts**: Primary index for device/battery lookups with time filtering
2. **idx_telemetry_battery_ts**: Index for battery_id-specific queries
3. **idx_telemetry_device_id_ts**: Index for device_id-specific queries
4. **idx_telemetry_soc_ts**: Composite index for SOC-based anomaly detection
5. **idx_telemetry_odo_ts**: Composite index for ODO-based anomaly detection

All indexes use partial indexes (WHERE clauses) to limit their size and improve performance by only indexing recent data (last 24 hours).

## Performance Considerations

- **Index Size**: Indexes will grow with your data. Monitor disk space.
- **Write Performance**: More indexes can slow down INSERT operations. Balance read vs. write performance.
- **Maintenance**: PostgreSQL automatically maintains indexes, but monitor for bloat.
- **Query Planning**: Use `EXPLAIN ANALYZE` to verify the query planner is using indexes.

## Optional: Materialized Views

The migration file includes commented-out code for creating a materialized view to cache anomaly detection results. This can significantly improve performance if:

- You have a very large number of batteries (thousands+)
- Anomaly detection queries are slow
- You can tolerate slightly stale anomaly data (refresh every 5-15 minutes)

To use materialized views:

1. Uncomment the materialized view code in the migration file
2. Create a scheduled job (cron, pg_cron, or application-level) to refresh the view:
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_battery_anomalies;
   ```

## Troubleshooting

### Indexes Not Being Used

1. Run `ANALYZE` on your table to update statistics
2. Check that the WHERE clause in your queries matches the index WHERE clause
3. Verify index creation with the verification queries in the migration file

### Slow Queries

1. Use `EXPLAIN ANALYZE` to identify bottlenecks
2. Check if indexes are being used (look for "Index Scan" in the plan)
3. Consider adjusting the time interval in the WHERE clauses
4. Monitor table statistics: `SELECT * FROM pg_stat_user_tables WHERE relname = 'your_table_name';`

### Disk Space Issues

1. Monitor index sizes: `SELECT pg_size_pretty(pg_relation_size('index_name'));`
2. Consider using partial indexes with more restrictive WHERE clauses
3. Archive old data if not needed for anomaly detection

## Production Deployment

For production deployments:

1. **Test First**: Always test migrations on a staging environment
2. **Backup**: Create a database backup before running migrations
3. **Concurrent Index Creation**: For large tables, use `CREATE INDEX CONCURRENTLY` to avoid locking:
   ```sql
   CREATE INDEX CONCURRENTLY idx_telemetry_device_ts 
   ON your_table (COALESCE(device_id, battery_id), ts DESC)
   WHERE ts >= NOW() - INTERVAL '24 hours';
   ```
4. **Monitor**: Watch query performance and index usage after deployment
5. **Rollback Plan**: Keep the original state or have a rollback script ready

