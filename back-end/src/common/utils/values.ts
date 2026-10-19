/**
 * Shared value helpers. Previously copied as private methods into a dozen services, in several
 * subtly different variants — the names below spell out which behaviour you get.
 */

/** First non-empty trimmed string, or a finite number as string; '' when none. */
export function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

/** First non-empty trimmed string (numbers are ignored); '' when none. */
export function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
