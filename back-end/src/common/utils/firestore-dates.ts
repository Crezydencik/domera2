/** Firestore Timestamp | Date | ISO string | epoch number → ISO string (null when invalid). */
export function firestoreDateToIso(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value.toDate() as Date).toISOString();
  }

  return null;
}

export function firestoreDateToMillis(value: unknown): number {
  const iso = firestoreDateToIso(value);
  if (!iso) return 0;
  const millis = new Date(iso).getTime();
  return Number.isFinite(millis) ? millis : 0;
}
