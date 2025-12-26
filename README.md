# Battery Fleet Monitoring Dashboard

A Next.js application for real-time battery fleet monitoring and anomaly detection.

## Features

- **Fleet Overview**: Dashboard showing total batteries, average SOC change, worst SOC drop, and batteries with no ODO movement
- **Battery Details**: Individual battery pages with:
  - SOC and ODO delta metrics
  - Anomaly count
  - Interactive charts (SOC vs Time, ODO vs Time)
  - Anomaly detection table
- **Color-coded Status**:
  - 🔴 Red: Batteries with no ODO change
  - 🟠 Orange: Batteries with low ODO change (< 0.1 km)
  - 🟢 Green: Normal batteries
- **Auto-refresh**: Data refreshes every 5 minutes using SWR
- **Dark Mode**: Default dark theme for better visibility

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file with your database credentials:
   - Copy `.env.example` to `.env.local`
   - Fill in your actual database values

   Required variables:
   ```
   DB_HOST=your-db-host          # e.g., localhost or your-db-host.com
   DB_NAME=your-db-name          # Your PostgreSQL database name
   DB_USER=your-db-user          # Database username
   DB_PASS=your-db-password      # Database password
   ```

   Optional variables:
   ```
   DB_PORT=5432                  # Defaults to 5432 if not specified
   TABLE_NAME=bms_data           # Defaults to "bms_data" if not specified
                                  # Can be schema-qualified: "public.iotbms_telemetry"
   ```

   Example `.env.local`:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=battery_monitoring
   DB_USER=postgres
   DB_PASS=mypassword
   TABLE_NAME=bms_data
   ```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Requirements

- PostgreSQL with TimescaleDB extension
- Table should have the following columns:
  - `ts` (timestamp)
  - `battery_id` (string)
  - `odo_meter_km` (numeric)
  - `battery_soc_pct` (numeric)

## API Routes

- `GET /api/fleet-summary` - Returns fleet summary statistics
- `GET /api/batteries` - Returns list of all batteries with deltas
- `GET /api/battery/[id]/aggregated` - Returns 2-hour aggregated data for a battery
- `GET /api/battery/[id]/anomalies` - Returns detected anomalies for a battery

## Anomaly Detection

Anomalies are detected using a hybrid rule:
- SOC drop < -15% OR
- SOC drop < (mean - 1.5 * std)

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- ShadCN UI components
- Recharts for data visualization
- SWR for data fetching
- PostgreSQL with TimescaleDB

## Deployment

<a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fyour-repo-name&env=DB_HOST,DB_NAME,DB_USER,DB_PASS,TABLE_NAME,NEXTAUTH_SECRET,NEXTAUTH_URL">
  <img src="https://vercel.com/button" alt="Deploy with Vercel"/>
</a>

For detailed deployment instructions, including how to set up the database and environment variables, please refer to [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md).


