import { Hono } from "hono";
import puppeteer from "puppeteer";
import { workerAuth } from "../middleware/auth";

const exportRoute = new Hono();

exportRoute.use("*", workerAuth);

/**
 * POST /export/pdf
 * Accepts { projectId, html } and returns a rendered PDF via Puppeteer.
 * The styled HTML is built on the web side and sent here fully formed.
 */
exportRoute.post("/pdf", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    projectId?: string;
    html?: string;
  };

  if (!body.projectId) {
    return c.json({ error: "projectId is required" }, 400);
  }
  if (!body.html?.trim()) {
    return c.json({ error: "html body is required" }, 400);
  }

  const executablePath = process.env["PUPPETEER_EXECUTABLE_PATH"];

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (err) {
    console.error("[export/pdf] Failed to launch Puppeteer:", err);
    return c.json(
      {
        error: "PDF generation failed: could not launch browser",
        detail: String(err),
      },
      500
    );
  }

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    // Assets are inlined as base64 data URIs by the web API route,
    // so we only need DOM ready — no external network fetches required.
    await page.setContent(body.html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="memo-${body.projectId}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[export/pdf] Puppeteer render error:", err);
    return c.json(
      {
        error: "PDF generation failed during rendering",
        detail: String(err),
      },
      500
    );
  } finally {
    await browser.close().catch(() => {});
  }
});

export { exportRoute };
