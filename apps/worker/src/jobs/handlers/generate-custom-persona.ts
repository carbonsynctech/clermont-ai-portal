import {
  claude,
  buildCustomPersonaSystemPrompt,
  buildCustomPersonaUserMessage,
} from "@repo/core";
import { lookupPerson } from "../../lib/linkedin";
import { createAdminClient } from "../../lib/supabase-admin";
import { assertData } from "../../lib/db";


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
  const supabase = createAdminClient();

  // Attempt OSINT lookup with automatic web search fallback
  let profileContent: string | undefined;
  if (linkedinUrl || name) {
    const lookupResult = await lookupPerson(name, linkedinUrl, true);
    if (lookupResult) {
      profileContent = lookupResult;
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

  const [inserted] = assertData(
    await supabase
      .from("personas")
      .insert({
        project_id: projectId,
        name: parsed.name,
        description: parsed.description,
        system_prompt: parsed.systemPrompt,
        tags: parsed.tags ?? [],
        source_urls: linkedinUrl ? [linkedinUrl] : [],
      })
      .select("id"),
  );

  if (!inserted) throw new Error("Failed to insert persona");

  await supabase
    .from("audit_logs")
    .insert({
      project_id: projectId,
      user_id: userId,
      action: "agent_response_received",
      step_number: 2,
      model_id: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      payload: { durationMs, customPersona: true, personaId: inserted.id },
    })
    .throwOnError();

  return { personaId: inserted.id };
}
