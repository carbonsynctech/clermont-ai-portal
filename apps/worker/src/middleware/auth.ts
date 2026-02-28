import { createMiddleware } from "hono/factory";

export const workerAuth = createMiddleware(async (c, next) => {
  const secret = c.req.header("x-worker-secret");
  const expectedSecret = process.env["WORKER_SECRET"];

  if (!expectedSecret) {
    console.error("WORKER_SECRET environment variable is not set");
    return c.json({ error: "Server misconfigured" }, 500);
  }

  if (!secret || secret !== expectedSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
