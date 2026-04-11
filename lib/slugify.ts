/**
 * Slugify utility for generating URL-safe slugs.
 *
 * Used by:
 *   - Event creation API (auto-generate landing_page_slug)
 *   - Admin event edit (manual slug input)
 */

/**
 * Convert a string to a URL-safe slug.
 *
 * - Lowercases
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 * - Truncates to maxLength (default 80)
 *
 * @example slugify("Kruse Brothers — Florence, AL") → "kruse-brothers-florence-al"
 */
export function slugify(text: string, maxLength = 80): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength);
}
