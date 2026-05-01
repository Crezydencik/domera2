type MeterHistoryEntry = {
  id: string;
  previousValue?: number | null;
  currentValue?: number | null;
  consumption?: number | null;
  month?: number;
  year?: number;
  submittedAt?: Date | string;
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toDateValue = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const buildMeterHistorySnapshot = (history: MeterHistoryEntry[]) => {
  const sorted = [...history].sort((a, b) => {
    const yearA = toNumberOrNull(a.year) ?? 0;
    const yearB = toNumberOrNull(b.year) ?? 0;
    if (yearA !== yearB) return yearA - yearB;

    const monthA = toNumberOrNull(a.month) ?? 0;
    const monthB = toNumberOrNull(b.month) ?? 0;
    if (monthA !== monthB) return monthA - monthB;

    const dateA = toDateValue(a.submittedAt)?.getTime() ?? 0;
    const dateB = toDateValue(b.submittedAt)?.getTime() ?? 0;
    return dateA - dateB;
  });

  // Группируем по месяцам/годам, оставляя только последнее значение в каждом месяце
  const monthlyMap = new Map<string, MeterHistoryEntry>();
  for (const item of sorted) {
    const year = toNumberOrNull(item.year) ?? 0;
    const month = toNumberOrNull(item.month) ?? 0;
    const key = `${year}-${month}`;
    // Берем последнюю запись для каждого месяца
    monthlyMap.set(key, item);
  }

  const uniqueByMonth = Array.from(monthlyMap.values());

  let prevCurrentValue: number | null = null;
  const normalized = uniqueByMonth.map((item) => {
    const currentValue = toNumberOrNull(item.currentValue);
    const previousValue = prevCurrentValue;
    const consumption =
      previousValue != null && currentValue != null
        ? Math.max(0, currentValue - previousValue)
        : toNumberOrNull(item.consumption);

    if (currentValue != null) {
      prevCurrentValue = currentValue;
    }

    return {
      ...item,
      previousValue,
      consumption,
    };
  });

  return {
    history: normalized,
    latestReading: normalized.length > 0 ? normalized[normalized.length - 1] : null,
  };
};
