import type { PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

/** Unwrap a Supabase `{ data, error }` response or throw. */
export function assertData<T>(
  result: PostgrestSingleResponse<T>,
  context?: string,
): T {
  if (result.error) {
    const prefix = context ? `[${context}] ` : "";
    throw new Error(`${prefix}${result.error.message}`);
  }
  return result.data;
}

/** Throw if the given version is sealed (immutable). */
export async function assertNotSealed(
  supabase: SupabaseClient,
  versionId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("versions")
    .select("is_sealed")
    .eq("id", versionId)
    .single();
  if (error) throw new Error(`Failed to check sealed status: ${error.message}`);
  if (data.is_sealed) {
    throw new Error(`Version ${versionId} is sealed and cannot be modified`);
  }
}
