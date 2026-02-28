import { Hono } from "hono";
import { workerAuth } from "../middleware/auth";
import { getJob } from "../jobs/queue";

const jobsRoute = new Hono();

jobsRoute.use("*", workerAuth);

jobsRoute.get("/:id", (c) => {
  const id = c.req.param("id");
  const job = getJob(id);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({
    id: job.id,
    type: job.type,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });
});

export { jobsRoute };
