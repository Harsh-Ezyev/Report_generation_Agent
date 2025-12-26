# Quick Start Guide - Paginated Battery Monitoring Dashboard

## Prerequisites

- Next.js application with TimescaleDB backend
- PostgreSQL/TimescaleDB database with battery telemetry data
- Environment variables configured (DB_HOST, DB_NAME, DB_USER, DB_PASS, TABLE_NAME)

## Setup Steps

### 1. Database Setup (5 minutes)

1. **Edit the migration file**:
   ```bash
   # Open sql/migrations/001_battery_monitoring_indexes.sql
   # Replace ${TABLE_NAME} with your actual table name
   # Example: Replace with 'bms_data' or 'public.iotbms_telemetry'
   ```

2. **Run the migration**:
   ```bash
   psql -h your_host -U your_user -d your_database -f sql/migrations/001_battery_monitoring_indexes.sql
   ```

3. **Verify indexes**:
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename = 'your_table_name';
   ```

### 2. Application Setup (Already Done)

The following files have been created/updated:

- ✅ `lib/query.ts` - Added pagination and anomaly detection functions
- ✅ `app/api/batteries/paginated/route.ts` - New paginated API endpoint
- ✅ `app/batteries/page.tsx` - New dashboard page
- ✅ Navigation links added to main pages

### 3. Test the Dashboard

1. **Start your development server**:
   ```bash
   npm run dev
   ```

2. **Navigate to the dashboard**:
   ```
   http://localhost:3000/batteries
   ```

3. **Verify functionality**:
   - Check that batteries load
   - Verify anomalies appear first
   - Test pagination controls
   - Check anomaly badges and colors

## API Testing

### Test the API directly:

```bash
# Get first page (20 items)
curl "http://localhost:3000/api/batteries/paginated?page=1&page_size=20"

# Get second page
curl "http://localhost:3000/api/batteries/paginated?page=2&page_size=20"

# Custom page size
curl "http://localhost:3000/api/batteries/paginated?page=1&page_size=50"
```

## Key Features to Verify

### ✅ Anomaly Prioritization
- Batteries with anomalies should appear on page 1
- Normal batteries only appear after all anomalies are shown
- Anomalies are sorted by severity (high > medium > low)

### ✅ Pagination
- Page navigation works (First, Previous, Next, Last)
- Page size can be changed (10, 20, 50, 100)
- Total count and page numbers are accurate

### ✅ Anomaly Visualization
- High severity: Red badge with AlertTriangle icon
- Medium severity: Orange badge with AlertCircle icon
- Low severity: Yellow badge with AlertCircle icon
- Normal: Green badge with CheckCircle2 icon

### ✅ Performance
- Pages load quickly (< 2 seconds for typical datasets)
- No full table scans (check with EXPLAIN ANALYZE)
- Indexes are being used

## Troubleshooting

### Issue: "Failed to fetch paginated batteries"

**Solution**: 
1. Check database connection
2. Verify TABLE_NAME environment variable
3. Check database logs for errors

### Issue: Slow queries

**Solution**:
1. Verify indexes were created: `\d your_table_name` in psql
2. Run ANALYZE: `ANALYZE your_table_name;`
3. Check query plan: Add `EXPLAIN ANALYZE` to queries

### Issue: No anomalies detected

**Solution**:
1. Verify data exists in last 24 hours
2. Check SOC and ODO values are not NULL
3. Review anomaly detection criteria in code comments

### Issue: Pagination not working correctly

**Solution**:
1. Verify stable sorting (device_id)
2. Check for concurrent updates
3. Review total_items count

## Next Steps

1. **Customize Anomaly Detection**: Adjust thresholds in `lib/query.ts`
2. **Add Filtering**: Extend API to support filters
3. **Optimize Further**: Consider materialized views for very large datasets
4. **Add Alerts**: Implement notifications for high-severity anomalies

## Performance Benchmarks

Expected performance on typical hardware:

- **1,000 batteries**: < 1 second per page
- **10,000 batteries**: < 2 seconds per page
- **100,000+ batteries**: Consider materialized views

## Support

For detailed documentation, see:
- `docs/BATTERY_MONITORING_DASHBOARD.md` - Full documentation
- `sql/README.md` - Database setup guide
- Code comments in implementation files

