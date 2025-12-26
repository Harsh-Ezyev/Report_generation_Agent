# Paginated Battery Monitoring Dashboard

## Overview

This document describes the implementation of a paginated battery monitoring dashboard that prioritizes anomaly detection and visualization. The system is designed to handle thousands of batteries and millions of time-series records efficiently using TimescaleDB.

## Architecture

### Components

1. **Backend API** (`/api/batteries/paginated`)
   - Paginated endpoint with anomaly-first prioritization
   - Efficient TimescaleDB queries
   - Caching headers for performance

2. **Frontend Dashboard** (`/batteries`)
   - React-based paginated interface
   - Real-time anomaly visualization
   - Loading states and error handling

3. **Query Functions** (`lib/query.ts`)
   - `getPaginatedBatteryList()`: Main pagination function
   - `detectAnomaliesForDevices()`: Batch anomaly detection

4. **Database Optimizations** (`sql/migrations/`)
   - Indexes for time-series queries
   - Optional materialized views for caching

## Key Features

### 1. Anomaly-First Pagination

The pagination system ensures that batteries with detected anomalies always appear first, regardless of page number:

- **Page 1**: Contains only anomalous batteries (up to page size)
- **Subsequent Pages**: Continue with anomalies until exhausted
- **Normal Batteries**: Only appear after all anomalies are shown

This ensures critical issues are always visible first.

### 2. Anomaly Detection

The system detects anomalies using multiple criteria:

#### High Severity
- SOC drops > 15% in 2-hour buckets
- No ODO movement (< 0.005 km)

#### Medium Severity
- Statistical anomalies (SOC drops < mean - 1.5*std)
- Low ODO movement (< 0.1 km)

#### Low Severity
- Minor statistical deviations

### 3. Performance Optimizations

#### Database Level
- **Partial Indexes**: Only index recent data (last 24 hours)
- **Time-Bucketed Aggregation**: Uses TimescaleDB `time_bucket()` for efficient grouping
- **Window Functions**: Single-pass statistical analysis
- **CTEs**: Efficient query organization

#### Application Level
- **Batch Processing**: Anomaly detection runs on batches, not individual devices
- **Caching**: API responses cached for 30 seconds
- **Lazy Loading**: Telemetry data only loaded when needed

## API Documentation

### Endpoint

```
GET /api/batteries/paginated?page=1&page_size=20
```

### Query Parameters

- `page` (integer, default: 1, min: 1): Page number
- `page_size` (integer, default: 20, min: 1, max: 100): Items per page

### Response Format

```typescript
{
  items: PaginatedBatteryItem[],
  pagination: {
    page: number,
    page_size: number,
    total_items: number,
    total_pages: number,
    has_next: boolean,
    has_previous: boolean,
    anomaly_count: number,
    normal_count: number
  }
}
```

### Example Request

```bash
curl "http://localhost:3000/api/batteries/paginated?page=1&page_size=20"
```

### Example Response

```json
{
  "items": [
    {
      "device_id": "DEV001",
      "battery_id": "BAT001",
      "soc_delta": -5.2,
      "odo_delta": 0.0,
      "cycles_last_24h": 0.5,
      "cycles_last_7d": 3.2,
      "cycles_last_30d": 12.5,
      "total_cycles": 45.3,
      "has_anomaly": true,
      "anomaly_severity": "high",
      "anomaly_count": 3,
      "last_anomaly_ts": "2024-01-15T10:30:00+05:30",
      "ts_first": "2024-01-15T00:00:00+05:30",
      "ts_last": "2024-01-15T12:00:00+05:30",
      "battery_soc_pct_first": 85.0,
      "battery_soc_pct_last": 79.8,
      "odo_meter_km_first": 1000.0,
      "odo_meter_km_last": 1000.0
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 150,
    "total_pages": 8,
    "has_next": true,
    "has_previous": false,
    "anomaly_count": 25,
    "normal_count": 125
  }
}
```

## SQL Query Examples

### Base Data Query

The system uses a comprehensive CTE-based query to fetch device summaries:

```sql
WITH device_summary AS (
  SELECT DISTINCT ON (COALESCE(device_id, battery_id))
    COALESCE(device_id, battery_id) AS device_key,
    device_id,
    battery_id,
    ts AS ts_first,
    battery_soc_pct AS soc_first,
    odo_meter_km AS odo_first
  FROM your_table
  WHERE ts >= NOW() - INTERVAL '24 hours'
  ORDER BY COALESCE(device_id, battery_id), ts ASC
),
device_latest AS (
  -- Latest data points
),
device_cycles AS (
  -- Cycle calculations
)
SELECT ...
```

### Anomaly Detection Query

Anomalies are detected using statistical analysis:

```sql
WITH aggregated_soc AS (
  SELECT
    COALESCE(device_id, battery_id) AS device_key,
    time_bucket('2 hours', ts) AS bucket_ts,
    AVG(battery_soc_pct) AS avg_soc,
    MAX(odo_meter_km) AS max_odo,
    MIN(odo_meter_km) AS min_odo
  FROM your_table
  WHERE COALESCE(device_id, battery_id) = ANY($1::text[])
    AND ts >= NOW() - INTERVAL '24 hours'
  GROUP BY device_key, bucket_ts
),
soc_changes AS (
  -- Calculate SOC drops
),
statistical_analysis AS (
  -- Calculate mean and stddev
),
anomaly_flags AS (
  -- Flag anomalies based on criteria
)
SELECT ...
```

## Frontend Implementation

### Component Structure

```
app/batteries/page.tsx
├── Summary Cards (Total, Anomalies, Normal, Current Page)
├── View Controls (Page Size, Navigation)
├── Battery Table (Paginated List)
└── Pagination Footer
```

### Key Features

1. **Real-time Updates**: Auto-refreshes every 60 seconds
2. **Loading States**: Skeleton loaders during data fetch
3. **Error Handling**: Graceful error messages with retry
4. **Anomaly Visualization**: Color-coded badges and icons
5. **Responsive Design**: Works on mobile and desktop

### Usage

Navigate to `/batteries` to access the dashboard. The page automatically loads the first page of data with anomalies prioritized.

## Database Setup

### 1. Run Migrations

See `sql/migrations/001_battery_monitoring_indexes.sql` for required indexes.

**Important**: Replace `${TABLE_NAME}` with your actual table name before running.

```bash
psql -h your_host -U your_user -d your_database -f sql/migrations/001_battery_monitoring_indexes.sql
```

### 2. Verify Indexes

```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'your_table_name' 
ORDER BY indexname;
```

### 3. Monitor Performance

```sql
EXPLAIN ANALYZE
SELECT ... -- your query
```

## Performance Considerations

### Scalability

The system is designed to handle:
- **Thousands of batteries**: Batch processing and pagination
- **Millions of records**: Time-filtered queries and partial indexes
- **High query volume**: Response caching and efficient queries

### Optimization Tips

1. **Index Maintenance**: Monitor index bloat and reindex periodically
2. **Query Tuning**: Use `EXPLAIN ANALYZE` to verify index usage
3. **Caching**: Consider materialized views for very large datasets
4. **Time Windows**: Adjust 24-hour window based on data volume

### Production Recommendations

1. **Use Materialized Views**: For datasets with 10,000+ batteries
2. **Background Jobs**: Refresh anomaly cache every 5-15 minutes
3. **Monitoring**: Track query performance and index usage
4. **Scaling**: Consider read replicas for high query volume

## Troubleshooting

### Slow Queries

1. Verify indexes are being used: `EXPLAIN ANALYZE`
2. Check table statistics: `ANALYZE your_table`
3. Review time window: Consider reducing from 24 hours
4. Monitor index usage: `pg_stat_user_indexes`

### Missing Anomalies

1. Check anomaly detection criteria
2. Verify data quality (SOC, ODO values)
3. Review statistical thresholds
4. Check time window coverage

### Pagination Issues

1. Verify stable sorting (device_id)
2. Check for concurrent data updates
3. Review page size limits
4. Monitor total item count

## Future Enhancements

1. **Real-time Updates**: WebSocket support for live anomaly detection
2. **Advanced Filtering**: Filter by severity, date range, device type
3. **Export Functionality**: CSV/PDF export of paginated results
4. **Alerting**: Email/SMS notifications for high-severity anomalies
5. **Historical Analysis**: Trend analysis and anomaly patterns
6. **Machine Learning**: ML-based anomaly detection

## Code Comments

All code includes extensive comments explaining:
- Query optimization strategies
- Performance considerations
- Business logic decisions
- Scalability approaches

Refer to inline comments in:
- `lib/query.ts`: Query functions and SQL logic
- `app/api/batteries/paginated/route.ts`: API endpoint
- `app/batteries/page.tsx`: Frontend components

## Support

For issues or questions:
1. Check this documentation
2. Review code comments
3. Examine SQL query plans
4. Monitor database performance metrics

