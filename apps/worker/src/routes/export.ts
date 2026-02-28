import { Hono } from "hono";
import puppeteer from "puppeteer";
import { db, versions } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { workerAuth } from "../middleware/auth";

const exportRoute = new Hono();

exportRoute.use("*", workerAuth);

exportRoute.get("/pdf", async (c) => {
  const projectId = c.req.query("projectId");

  if (!projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }

  // Fetch the exported_html version for this project
  const htmlVersion = await db.query.versions.findFirst({
    where: and(
      eq(versions.projectId, projectId),
      eq(versions.versionType, "exported_html")
    ),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });

  if (!htmlVersion) {
    return c.json({ error: "No HTML export found for this project" }, 404);
  }

  // Launch Puppeteer and render PDF
  const executablePath = process.env["PUPPETEER_EXECUTABLE_PATH"];
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlVersion.content, { waitUntil: "networkidle0" });
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

export { exportRoute };
