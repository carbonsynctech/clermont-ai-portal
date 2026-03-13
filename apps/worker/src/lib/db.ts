import type { PostgrestSingleResponse } from "@supabase/supabase-js";

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
