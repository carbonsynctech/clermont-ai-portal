import { db, personas, auditLogs } from "@repo/db";
import {
  claude,
  buildCustomPersonaSystemPrompt,
  buildCustomPersonaUserMessage,
} from "@repo/core";

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

  const personaUserMessageOpts: { name: string; linkedinUrl?: string; context?: string } = { name };
  if (linkedinUrl !== undefined) personaUserMessageOpts.linkedinUrl = linkedinUrl;
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

  const [inserted] = await db
    .insert(personas)
    .values({
      projectId,
      name: parsed.name,
      description: parsed.description,
      systemPrompt: parsed.systemPrompt,
      tags: parsed.tags ?? [],
      sourceUrls: linkedinUrl ? [linkedinUrl] : [],
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
