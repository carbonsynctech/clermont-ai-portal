import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is not set");

const isServerless = !!process.env["VERCEL"];

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
