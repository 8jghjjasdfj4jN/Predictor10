/*
Predictor10 — database client.

Single Drizzle instance shared across the server. Connection details come from
DATABASE_URL (Render Postgres). Schema is the full set of tables in ./schema/*
— active + dormant — so type inference works against every table the licensed
product needs, even before those tables are written to.

Roadmap: this module is the foundation for Weeks 1-4 work (auth, pools,
settlement). Imported by route handlers and the settlement cron.
*/

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL env var not set. Copy .env.example to .env and fill in your Render Postgres URL.",
  );
}

// postgres-js client.
// Render Postgres connection strings include `?sslmode=require`, so postgres-js
// negotiates TLS automatically — no extra config needed here. Pool size kept
// modest for Render's smallest paid Postgres tier.
export const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // pgbouncer compatibility if we ever route through one
});

export const db = drizzle(client, {
  schema,
  logger: process.env.DB_LOG === "true",
});

export { schema };
export type Db = typeof db;
