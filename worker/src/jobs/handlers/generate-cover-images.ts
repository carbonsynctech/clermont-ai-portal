import { gemini } from "@repo/lib";
import type { CoverImagesData, CoverImageEntry, Json } from "@repo/db";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";

export interface CoverImagesPayload {
  projectId: string;
  userId: string;
  styleGuideId: string;
}

const STYLES = ["corporate", "modern", "minimal", "bold"] as const;
type CoverStyle = (typeof STYLES)[number];

interface ProjectContext {
  title: string;
  company: string;
  documentType: string;
  sector: string;
  subject: string;
}

function buildContext(
  title: string,
  brief: Record<string, unknown> | null | undefined,
): ProjectContext {
  const b = brief ?? {};
  const company =
    (b["companyName"] as string | undefined) ??
    (b["organizationName"] as string | undefined) ??
    (b["systemProductName"] as string | undefined) ??
    title;

  const documentType =
    (b["documentType"] as string | undefined) ?? "Investment Memorandum";

  const sector =
    (b["sector"] as string | undefined) ??
    (b["industry"] as string | undefined) ??
    (b["targetIndustry"] as string | undefined) ??
    (b["researchDomain"] as string | undefined) ??
    (b["policyDomain"] as string | undefined) ??
    (b["techStack"] as string | undefined) ??
    "";

  const subject =
    (b["keyQuestion"] as string | undefined) ??
    (b["strategicFocus"] as string | undefined) ??
    (b["topicArea"] as string | undefined) ??
    (b["topicInitiative"] as string | undefined) ??
    (b["initiativeName"] as string | undefined) ??
    (b["researchDomain"] as string | undefined) ??
    title;

  return { title, company, documentType, sector, subject };
}

function buildPrompt(style: CoverStyle, ctx: ProjectContext): string {
  const { company, documentType, sector, subject } = ctx;

  // A one-line description of what this project is about, used to anchor the visual theme
  const themeHint = [
    sector && `in the ${sector} sector`,
    `focused on "${subject}"`,
  ]
    .filter(Boolean)
    .join(", ");

  switch (style) {
    case "corporate":
      return (
        `Abstract graphic artwork for the cover of a ${documentType} about ${company}${themeHint ? `, ${themeHint}` : ""}. ` +
        `The image must visually evoke the world of ${company}${sector ? ` and the ${sector} industry` : ""} ` +
        `— use symbolic imagery, textures, and compositions drawn from that domain ` +
        `(e.g. architecture, infrastructure, data networks, natural resources, financial flows — whatever fits). ` +
        `Deep navy blue (#0F2A4A) background. Warm gold accent light. Atmospheric depth. Photorealistic or painterly. ` +
        `Absolutely no text, no letters, no words, no numbers anywhere in the image. ` +
        `Portrait 2:3 format. Ultra-high quality, professional and authoritative.`
      );
    case "modern":
      return (
        `Contemporary graphic artwork for the cover of a ${documentType} about ${company}${themeHint ? `, ${themeHint}` : ""}. ` +
        `The image should represent the essence of ${company}${sector ? ` in the ${sector} space` : ""} ` +
        `through clean modern visual language — geometric shapes, materials, processes, or environments ` +
        `associated with that industry and the topic "${subject}". ` +
        `White and light gray palette with bold navy accent. Crisp, forward-looking, energetic composition. ` +
        `No text, no letters, no words, no numbers at all. ` +
        `Portrait 2:3 format. Sharp modern aesthetic.`
      );
    case "minimal":
      return (
        `Minimalist abstract artwork for the cover of a ${documentType} about ${company}${themeHint ? `, ${themeHint}` : ""}. ` +
        `Capture the spirit of ${company}${sector ? ` and the ${sector} sector` : ""} ` +
        `through a single carefully chosen visual element — a material, a form, a texture, a landscape — ` +
        `that embodies "${subject}". Vast negative space. Near-white background. ` +
        `Pale gold or warm gray accent. Breathtaking restraint and elegance. ` +
        `Zero text, zero letters, zero words anywhere. ` +
        `Portrait 2:3 format. Museum-quality composition.`
      );
    case "bold":
      return (
        `Dramatic high-contrast artwork for the cover of a ${documentType} about ${company}${themeHint ? `, ${themeHint}` : ""}. ` +
        `The imagery must powerfully represent ${company}${sector ? ` in the ${sector} industry` : ""} ` +
        `and the theme of "${subject}" — use evocative, large-scale visuals from that world ` +
        `(aerial views, macro details, sweeping panoramas, industrial scale, technological grandeur). ` +
        `Near-black charcoal background. Rich amber and gold lighting. Cinematic drama. ` +
        `No text, no letters, no words, no numbers anywhere. ` +
        `Portrait 2:3 format. Powerful and authoritative.`
      );
  }
}

export async function generateCoverImages(payload: CoverImagesPayload): Promise<void> {
  const { projectId, userId, styleGuideId } = payload;
  const supabase = createAdminClient();

  // 1. Fetch project + style guide
  const project = assertData(
    await supabase.from("projects").select().eq("id", projectId).single(),
  );

  const styleGuide = assertData(
    await supabase
      .from("style_guides")
      .select()
      .eq("id", styleGuideId)
      .eq("project_id", projectId)
      .single(),
  );

  const ctx = buildContext(project.title, project.brief_data as Record<string, unknown> | null);

  // 2. Build 4 prompts
  const prompts = STYLES.map((style) => buildPrompt(style, ctx));

  // 3. Generate images in parallel via Nano Banana (Gemini image model)
  const startedAt = Date.now();
  const results = await gemini.generateImages(prompts, "2:3");

  // 4. Upload each non-null result to Supabase Storage
  const timestamp = Date.now();

  const entries: CoverImageEntry[] = [];

  await Promise.all(
    STYLES.map(async (style, i) => {
      const result = results[i];
      if (!result) {
        console.warn(`[cover-images] Generation returned null for style: ${style}`);
        return;
      }

      const mimeType = result.mimeType;
      const ext = mimeType.includes("jpeg") ? "jpg" : "png";
      const storagePath = `${userId}/${projectId}/covers/${style}-${timestamp}.${ext}`;
      const imageBuffer = Buffer.from(result.imageData, "base64");

      const { error } = await supabase.storage
        .from("source-materials")
        .upload(storagePath, imageBuffer, { contentType: mimeType, upsert: true });

      if (error) {
        console.error(`[cover-images] Storage upload failed for ${style}:`, error.message);
        return;
      }

      entries.push({ storagePath, style, prompt: prompts[i] ?? "", mimeType });
    }),
  );

  if (entries.length === 0) {
    throw new Error("All cover image generations failed — no images to save");
  }

  // 5. Save entries to style_guides.cover_images
  const coverImagesData: CoverImagesData = {
    images: entries,
    selectedStyle: entries[0]?.style ?? null,
    generatedAt: new Date().toISOString(),
  };

  await supabase
    .from("style_guides")
    .update({ cover_images: coverImagesData as unknown as Json })
    .eq("id", styleGuideId)
    .throwOnError();

  // 6. Audit log
  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "agent_response_received",
      step_number: 6,
      model_id: process.env["NANO_BANANA_MODEL"] ?? "gemini-2.5-flash-image",
      input_tokens: 0,
      output_tokens: 0,
      payload: {
        durationMs: Date.now() - startedAt,
        coverImagesGenerated: entries.length,
        styles: entries.map((e) => e.style),
      },
    })
    .throwOnError();
}
