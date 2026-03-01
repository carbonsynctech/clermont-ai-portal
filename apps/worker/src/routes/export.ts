import { Hono } from "hono";
import puppeteer from "puppeteer";
import { buildExportHtmlDocument } from "@repo/core";
import { db, versions } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { workerAuth } from "../middleware/auth";

const exportRoute = new Hono();

exportRoute.use("*", workerAuth);

exportRoute.post("/pdf", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { projectId?: string; html?: string };
  const projectId = body.projectId;

  if (!projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }

  const finalVersion = await db.query.versions.findFirst({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.versionType, "final")
    ),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  if (!finalVersion) {
    return c.json({ error: "No final version found for this project" }, 404);
  }

  const html = body.html?.trim()
    ? body.html
    : buildExportHtmlDocument(finalVersion.content, `memo-${projectId}`);

  // Launch Puppeteer and render PDF
  const executablePath = process.env["PUPPETEER_EXECUTABLE_PATH"];
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
    });

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="memo-${projectId}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
});

exportRoute.get("/pdf", async (c) => {
  const projectId = c.req.query("projectId");

  if (!projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }

  const req = new Request("http://worker.local/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });

  return exportRoute.fetch(req, c.env, c.executionCtx);
});

export { exportRoute };
