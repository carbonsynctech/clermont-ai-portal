import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const isServerless = !!process.env["VERCEL"];
const isCiBuild = process.env["CI"] === "true" || process.env["VERCEL"] === "1";

// In CI/build environments, allow module import to succeed even when DATABASE_URL
// is not injected at build time. Real queries will still fail at runtime if truly missing.
const connectionString = process.env["DATABASE_URL"]
  ?? (isCiBuild ? "postgres://build:build@127.0.0.1:5432/build" : undefined);

if (!connectionString) throw new Error("DATABASE_URL is not set");

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

const client =
  globalForDb.pgClient ??
  postgres(connectionString, {
    max: isServerless ? 1 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
export type DB = typeof db;
