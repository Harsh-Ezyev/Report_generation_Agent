import { Pool } from "pg";

if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASS) {
  throw new Error("Missing required database environment variables");
}

// Parse host and port if port is included in DB_HOST
let dbHost = process.env.DB_HOST;
let dbPort: number | undefined = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;

// Check if port is included in hostname (format: hostname:port)
if (dbHost.includes(":")) {
  const parts = dbHost.split(":");
  dbHost = parts[0];
  if (parts[1]) {
    dbPort = parseInt(parts[1], 10);
  }
}

const pool = new Pool({
  host: dbHost,
  port: dbPort,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  ssl: {
    rejectUnauthorized: false,
  },
  // Optimize for serverless (Vercel)
  max: process.env.VERCEL ? 1 : 20,
  idleTimeoutMillis: process.env.VERCEL ? 30000 : 30000,
  connectionTimeoutMillis: 10000,
  // Allow connection reuse in serverless
  allowExitOnIdle: true,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log("Executed query", { text, duration, rows: res.rowCount });
    return res.rows as T[];
  } catch (error) {
    console.error("Database query error", { text, error });
    throw error;
  }
}

export default pool;

