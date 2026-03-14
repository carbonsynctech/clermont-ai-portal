/**
 * Sanitize a filename to ASCII-safe characters for use in Supabase Storage paths.
 *
 * Special/unicode characters (smart quotes, em-dashes, $, ~, spaces, etc.)
 * cause JWT signature mismatches in Supabase signed upload URLs because
 * the token signs one URL-encoding while the browser sends another.
 *
 * The original filename should be preserved separately (e.g. in a DB column)
 * so the user still sees the real name in the UI.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // smart single quotes → apostrophe
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')    // smart double quotes
    .replace(/[\u2013\u2014]/g, "-")                 // en/em dashes
    .replace(/[^\w.\-]/g, "_")                       // anything non-alphanumeric → underscore
    .replace(/_{2,}/g, "_")                          // collapse consecutive underscores
    .replace(/^_|_(?=\.\w+$)/g, "");                 // trim leading _ and _ before extension
}
