import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { health } from "./routes/health";
import { jobsRoute } from "./routes/jobs";
import { stagesRoute } from "./routes/stages";
import { exportRoute } from "./routes/export";
import { personasRoute } from "./routes/personas";
import { startQueueConsumer } from "./jobs/runner";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env["WORKER_CORS_ORIGIN"] ?? "http://localhost:3000",
    allowHeaders: ["Content-Type", "x-worker-secret"],
    allowMethods: ["GET", "POST"],
  })
);

app.route("/health", health);
app.route("/jobs", jobsRoute);
app.route("/stages", stagesRoute);
app.route("/export", exportRoute);
app.route("/personas", personasRoute);

const port = Number(process.env["PORT"] ?? 3001);

console.log(`Worker starting on port ${port}`);

serve({ fetch: app.fetch, port });

startQueueConsumer();
console.log("PGMQ queue consumer started");
