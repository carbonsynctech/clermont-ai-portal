import { db, personas, auditLogs } from "@repo/db";
import {
  claude,
  buildCustomPersonaSystemPrompt,
  buildCustomPersonaUserMessage,
} from "@repo/core";
import { scrapeLinkedIn, searchForPerson } from "../../lib/linkedin";

const WESLEY_LINKEDIN_URL = "https://www.linkedin.com/in/wesleyquek/";

const WESLEY_PROFILE_FALLBACK = `Tech Advisory | Blockchain & AI Enthusiast | Sustainability

Innovative technology leader passionate about reshaping industries by leveraging emerging solutions and strategic product development. With a proven track record in driving transformative projects, I thrive in dynamic environments, leveraging emerging technologies to create value and spearhead positive change.

Chief Technology Officer

&you · Full-time

Dec 2025 - Present · 4 mos

Philippines · Hybrid

Building the future of telehealth in Southeast Asia. We deliver affordable, science-backed treatments for weight loss, hair loss, and more—compounded in FDA-licensed labs and shipped nationwide.

Founder

Carbon Sync Ventures · Full-time

Feb 2024 - Present · 2 yrs 2 mos

Singapore · On-site

Founded on the belief that revolutionary technologies can bridge the gap between ambition and action, we are committed to transforming the landscape of sustainability.

Our mission is to not only support those at the forefront of sustainable development but also to empower stakeholders, from regulators to organisations, ensuring that every project contributes to a more sustainable future.

At Carbon Sync Ventures, we are not just advocating for change; we are facilitating it, one innovative solution at a time.

Vice President - Product

The Binary Holdings · Full-time

Apr 2023 - Feb 2024 · 11 mos

Singapore · Hybrid

Driving grassroots value creation, tokenized utility and decentralized innovation at The Binary Holdings—proud trailblazers in the Web 3.0 industry. At the heart of our operations is The Binary Network, a sophisticated hub intricately connecting our millions of users and products across diverse sectors. Fueling this dynamic and growing network is TBHC, The Binary Network's native utility token. Beyond facilitating seamless transactions, TBHC powers every interaction on the Binary Network.

Business Development Manager

FTX · Full-time

Oct 2022 - Dec 2022 · 3 mos

Singapore

Data Transformation Advisory

KPMG Singapore · Full-time

Feb 2022 - Oct 2022 · 9 mos

Site Reliability Engineer

DBS Bank · Internship

Jun 2021 - Sep 2021 · 4 mos

Singapore

Intern - Site Reliability Engineering team

Wesley is a seasoned technology professional whose career is distinguished by his ability to bridge the gap between business needs and technological innovation. He graduated with a bachelor's degree in computer science from the Singapore University of Technology and Design, which laid the groundwork for his ventures into the tech world.

Wesley began his career as a software engineer at DBS, where he honed his skills in site reliability engineering. He then advanced to a role in data driven transformation consulting at KPMG, helping businesses harness the power of data.

Most recently, Wesley served as the head of product at The Binary Holdings, where he spearheaded the development of cutting-edge tech products, primarily utilising blockchain technologies.

His passion for integrating business imperatives with the latest technological advancements drives his continual pursuit of innovation, especially at the intersection of AI, data, and sustainability.`;

function normalizeLinkedInInput(value: string): string {
  const lowered = value.trim().toLowerCase();
  try {
    const parsed = new URL(lowered);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return lowered.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

function shouldUseWesleyFallback(name: string, linkedinUrl?: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  const normalizedLinkedin = linkedinUrl ? normalizeLinkedInInput(linkedinUrl) : "";

  if (normalizedName.includes("wesley quek") || normalizedName.includes("wesleyquek")) {
    return true;
  }

  if (normalizedName.includes("linkedin.com/in/wesleyquek")) {
    return true;
  }

  return normalizedLinkedin.includes("linkedin.com/in/wesleyquek");
}

export interface CustomPersonaPayload {
  name: string;
  linkedinUrl?: string;
  context?: string;
  projectId: string;
  userId: string;
}

interface PersonaResult {
  name: string;
  description: string;
  systemPrompt: string;
  tags?: string[];
}

export async function generateCustomPersona(
  payload: CustomPersonaPayload,
  onChunk?: (chunk: string) => void,
): Promise<{ personaId: string }> {
  const { name, linkedinUrl, context, projectId, userId } = payload;

  let profileContent: string | undefined;
  const useWesleyFallback = shouldUseWesleyFallback(name, linkedinUrl);

  if (useWesleyFallback) {
    profileContent = `LinkedIn profile data:\n${WESLEY_PROFILE_FALLBACK}`;
  } else if (linkedinUrl) {
    const scraped = await scrapeLinkedIn(linkedinUrl);
    if (scraped) {
      profileContent = `LinkedIn profile data:\n${scraped}`;
    } else {
      const searched = await searchForPerson(name, linkedinUrl);
      if (searched) profileContent = searched;
    }
  }

  const personaUserMessageOpts: {
    name: string;
    linkedinUrl?: string;
    profileContent?: string;
    context?: string;
  } = { name };
  if (linkedinUrl !== undefined) personaUserMessageOpts.linkedinUrl = linkedinUrl;
  if (profileContent !== undefined) personaUserMessageOpts.profileContent = profileContent;
  if (context !== undefined) personaUserMessageOpts.context = context;

  const callOptions = {
    system: buildCustomPersonaSystemPrompt(),
    messages: [
      {
        role: "user" as const,
        content: buildCustomPersonaUserMessage(personaUserMessageOpts),
      },
    ],
  };

  const startedAt = Date.now();
  const result = onChunk
    ? await claude.stream(callOptions, onChunk)
    : await claude.call(callOptions);
  const durationMs = Date.now() - startedAt;

  let parsed: PersonaResult;
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in response");
    }
    parsed = JSON.parse(jsonMatch[0]) as PersonaResult;
  } catch (err) {
    throw err instanceof Error ? err : new Error("Failed to parse custom persona from Claude response");
  }

  const sourceUrl = useWesleyFallback ? WESLEY_LINKEDIN_URL : linkedinUrl;

  const [inserted] = await db
    .insert(personas)
    .values({
      projectId,
      name: parsed.name,
      description: parsed.description,
      systemPrompt: parsed.systemPrompt,
      tags: parsed.tags ?? [],
      sourceUrls: sourceUrl ? [sourceUrl] : [],
    })
    .returning({ id: personas.id });

  if (!inserted) throw new Error("Failed to insert persona");

  await db.insert(auditLogs).values({
    projectId,
    userId,
    action: "agent_response_received",
    stepNumber: 2,
    modelId: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    payload: { durationMs, customPersona: true, personaId: inserted.id },
  });

  return { personaId: inserted.id };
}
