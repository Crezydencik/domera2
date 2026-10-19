import { BadRequestException } from '@nestjs/common';

const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_MAX_DEPTH = 6;

/** Fields no client payload may set directly on any stored document. */
export const ALWAYS_PROTECTED_KEYS = ['id', 'createdAt', 'createdBy', 'createdByUid', 'updatedAt', 'deletedAt'] as const;

/**
 * Copies a free-form client payload before it is written to Firestore:
 * - drops protected keys (tenant scope, storage pointers, audit fields, ...) and `__*` keys;
 * - rejects payloads that are too large or too deeply nested.
 * Unknown but harmless fields are kept, so existing clients keep working.
 */
export function sanitizeClientPayload(
  payload: Record<string, unknown> | undefined | null,
  options: { protectedKeys?: readonly string[]; maxBytes?: number; maxDepth?: number } = {},
): Record<string, unknown> {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const blocked = new Set<string>([...ALWAYS_PROTECTED_KEYS, ...(options.protectedKeys ?? [])]);
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  const depthOf = (value: unknown, depth: number): number => {
    if (depth > maxDepth) return depth;
    if (Array.isArray(value)) return Math.max(depth, ...value.map((item) => depthOf(item, depth + 1)));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Math.max(depth, ...Object.values(value).map((item) => depthOf(item, depth + 1)));
    }
    return depth;
  };

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (blocked.has(key) || key.startsWith('__') || value === undefined) continue;
    result[key] = value;
  }

  if (depthOf(result, 0) > maxDepth) throw new BadRequestException('Payload is nested too deeply');
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (bytes > (options.maxBytes ?? DEFAULT_MAX_BYTES)) throw new BadRequestException('Payload is too large');

  return result;
}
