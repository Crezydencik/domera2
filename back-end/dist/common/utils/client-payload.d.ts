export declare const ALWAYS_PROTECTED_KEYS: readonly ["id", "createdAt", "createdBy", "createdByUid", "updatedAt", "deletedAt"];
export declare function sanitizeClientPayload(payload: Record<string, unknown> | undefined | null, options?: {
    protectedKeys?: readonly string[];
    maxBytes?: number;
    maxDepth?: number;
}): Record<string, unknown>;
