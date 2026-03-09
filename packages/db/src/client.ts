import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is not set");

const isServerless = !!process.env["VERCEL"];

const client = postgres(connectionString, {
  max: isServerless ? 1 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: isServerless ? false : true,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
