# Environment Variables Setup Guide

## Quick Setup

The application is currently showing errors because database environment variables are not configured. Follow these steps to fix it:

### Step 1: Create `.env.local` file

In the root directory of your project, create a file named `.env.local` (this file is gitignored and won't be committed).

### Step 2: Add your database credentials

Copy the template below and fill in your actual values:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASS=your_database_password
TABLE_NAME=bms_data
```

### Step 3: Restart the development server

After creating `.env.local`, restart your Next.js development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## Environment Variables Explained

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL database hostname | `localhost` or `db.example.com` |
| `DB_NAME` | Name of your PostgreSQL database | `battery_monitoring` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASS` | PostgreSQL password | `your_password` |

### Optional Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DB_PORT` | PostgreSQL port number | `5432` | `5432` |
| `TABLE_NAME` | Name of your telemetry table | `bms_data` | `bms_data` or `public.iotbms_telemetry` |

### Notes

- **DB_HOST**: If your host includes a port (e.g., `hostname:5432`), you can include it here and omit `DB_PORT`
- **TABLE_NAME**: Can be schema-qualified (e.g., `public.iotbms_telemetry`) or just the table name (e.g., `bms_data`)
- **Security**: Never commit `.env.local` to version control (it's already in `.gitignore`)

## Example Configurations

### Local Development
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=battery_db
DB_USER=postgres
DB_PASS=postgres
TABLE_NAME=bms_data
```

### Remote Database
```env
DB_HOST=db.example.com
DB_PORT=5432
DB_NAME=production_db
DB_USER=app_user
DB_PASS=secure_password_123
TABLE_NAME=public.iotbms_telemetry
```

### Host with Port Included
```env
DB_HOST=db.example.com:5432
DB_NAME=production_db
DB_USER=app_user
DB_PASS=secure_password_123
TABLE_NAME=bms_data
```

## Troubleshooting

### Error: "Missing required database environment variables"

**Cause**: The `.env.local` file doesn't exist or is missing required variables.

**Solution**: 
1. Verify `.env.local` exists in the project root
2. Check that all required variables are set
3. Restart the development server

### Error: Connection refused / Cannot connect to database

**Cause**: Database credentials are incorrect or database is not accessible.

**Solution**:
1. Verify database is running
2. Check host, port, username, and password
3. Verify network connectivity (for remote databases)
4. Check firewall rules

### Error: Table does not exist

**Cause**: `TABLE_NAME` is incorrect or table doesn't exist.

**Solution**:
1. Verify table name in your database
2. Check if schema qualification is needed (e.g., `public.table_name`)
3. Run the database migrations if needed

## Verification

After setting up environment variables, you can verify the connection by:

1. **Check the terminal**: The server should start without database errors
2. **Visit the dashboard**: Navigate to `http://localhost:3000`
3. **Check API endpoints**: Try `http://localhost:3000/api/fleet-summary`

If you see data instead of errors, your environment is configured correctly!

