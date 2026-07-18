"use client";

import React from "react";

export type MeterVariant = "cold" | "hot" | "electricity";

export interface MeterReadingInputProps {
  variant: MeterVariant;
  /** Label like "Холодная вода" / "Горячая вода" */
  label: string;
  /** Serial number shown after "№" */
  serialNumber?: string;
  /** Previous reading value (numeric, can be float) */
  previousValue?: number | string | null;
  /** Period label for previous, e.g. "02.2026" */
  previousPeriod?: string;
  /** Period label for current, e.g. "03.2026" */
  currentPeriod?: string;
  /** Current value as string (e.g. "123.456"); controlled */
  value?: string;
  onChange?: (value: string) => void;
  /** Number of integer digit boxes (default 5) */
  intDigits?: number;
  /** Number of decimal digit boxes (default 3) */
  decDigits?: number;
  disabled?: boolean;
  size?: "large" | "compact";
  /** Localized labels */
  labels?: {
    previous?: string;
    current?: string;
    serialPrefix?: string;
  };
}

const VARIANT_STYLES: Record<MeterVariant, { bar: string; cell: string; separator: string }> = {
  cold: {
    bar: "bg-blue-500",
    cell: "border-blue-400 bg-blue-50 text-slate-950 focus:border-blue-500 focus:ring-blue-300/50",
    separator: "text-blue-300",
  },
  hot: {
    bar: "bg-rose-500",
    cell: "border-rose-400 bg-rose-50 text-slate-950 focus:border-rose-500 focus:ring-rose-300/50",
    separator: "text-rose-300",
  },
  electricity: {
    bar: "bg-amber-400",
    cell: "border-amber-400 bg-amber-50 text-slate-950 focus:border-amber-500 focus:ring-amber-300/50",
    separator: "text-amber-300",
  },
};

function splitValue(value: string, intDigits: number, decDigits: number): { ints: string[]; decs: string[] } {
  // Preserve exact positions: align integer part to the RIGHT, decimal part to the LEFT.
  // Empty cells stay empty (no padding with zeros) so the user's caret position never shifts.
  const [rawInt = "", rawDec = ""] = (value || "").split(/[.,]/);
  const intDigitsOnly = rawInt.replace(/\D/g, "").slice(-intDigits);
  const decDigitsOnly = rawDec.replace(/\D/g, "").slice(0, decDigits);
  const ints = Array<string>(intDigits).fill("");
  const decs = Array<string>(decDigits).fill("");
  // Right-align integer digits
  for (let i = 0; i < intDigitsOnly.length; i += 1) {
    ints[intDigits - intDigitsOnly.length + i] = intDigitsOnly[i];
  }
  // Left-align decimal digits
  for (let i = 0; i < decDigitsOnly.length; i += 1) {
    decs[i] = decDigitsOnly[i];
  }
  return { ints, decs };
}

function joinValue(ints: string[], decs: string[]): string {
  const hasAnyInt = ints.some((c) => c !== "");
  const hasAnyDec = decs.some((c) => c !== "");
  if (!hasAnyInt && !hasAnyDec) return "";
  // Replace empty integer cells with "0" so position is preserved on re-parse.
  const intStr = ints.map((c) => (c === "" ? "0" : c)).join("").replace(/^0+(?=\d)/, "") || "0";
  // Trim only trailing empty decimal cells; keep internal empties as "0".
  let lastDec = -1;
  for (let i = decs.length - 1; i >= 0; i -= 1) {
    if (decs[i] !== "") {
      lastDec = i;
      break;
    }
  }
  const decStr = decs
    .slice(0, lastDec + 1)
    .map((c) => (c === "" ? "0" : c))
    .join("");
  return decStr ? `${intStr}.${decStr}` : intStr;
}

export function MeterReadingInput({
  variant,
  label,
  serialNumber,
  previousValue,
  previousPeriod,
  currentPeriod,
  value = "",
  onChange,
  intDigits = 5,
  decDigits = 3,
  disabled,
  size = "large",
  labels,
}: MeterReadingInputProps) {
  const styles = VARIANT_STYLES[variant];
  const L = {
    previous: labels?.previous ?? "Предыдущее показание",
    current: labels?.current ?? "Текущее показание",
    serialPrefix: labels?.serialPrefix ?? "№",
  };

  const cellRefs = React.useRef<Array<HTMLInputElement | null>>([]);
  const total = intDigits + decDigits;

  // Local cell state — authoritative for caret/position. Synced FROM `value`
  // only when the external string differs from what we'd produce ourselves
  // (so typing in a middle cell never causes digits to "jump").
  const [ints, setInts] = React.useState<string[]>(() => splitValue(value, intDigits, decDigits).ints);
  const [decs, setDecs] = React.useState<string[]>(() => splitValue(value, intDigits, decDigits).decs);

  React.useEffect(() => {
    const current = joinValue(ints, decs);
    if ((value || "") === current) return;
    const next = splitValue(value || "", intDigits, decDigits);
    setInts(next.ints);
    setDecs(next.decs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, intDigits, decDigits]);

  const emit = (nextInts: string[], nextDecs: string[]) => {
    setInts(nextInts);
    setDecs(nextDecs);
    onChange?.(joinValue(nextInts, nextDecs));
  };

  const setDigit = (index: number, digit: string) => {
    const cleaned = digit.replace(/\D/g, "").slice(-1);
    const allInts = [...ints];
    const allDecs = [...decs];
    if (index < intDigits) allInts[index] = cleaned;
    else allDecs[index - intDigits] = cleaned;
    emit(allInts, allDecs);
  };

  const focusCell = (i: number) => {
    const el = cellRefs.current[i];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusCell(Math.max(0, i - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusCell(Math.min(total - 1, i + 1));
    } else if (e.key === "Backspace") {
      const current = i < intDigits ? ints[i] : decs[i - intDigits];
      if (!current && i > 0) {
        e.preventDefault();
        setDigit(i - 1, "");
        focusCell(i - 1);
      }
    }
  };

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setDigit(i, "");
      return;
    }
    if (raw.length > 1) {
      const allInts = [...ints];
      const allDecs = [...decs];
      let cursor = i;
      for (const ch of raw) {
        if (cursor >= total) break;
        if (cursor < intDigits) allInts[cursor] = ch;
        else allDecs[cursor - intDigits] = ch;
        cursor += 1;
      }
      emit(allInts, allDecs);
      focusCell(Math.min(total - 1, cursor));
      return;
    }
    setDigit(i, raw);
    if (i < total - 1) focusCell(i + 1);
  };

  const previousFormatted =
    previousValue === null || previousValue === undefined || previousValue === ""
      ? "—"
      : String(previousValue);
  const isCompact = size === "compact";

  const cellClass =
    `rounded-[6px] border text-center font-bold tabular-nums outline-none transition focus:ring-2 ` +
    `${styles.cell} ` +
    (isCompact
      ? `h-8 min-w-0 w-full text-sm min-[360px]:h-9 sm:text-base `
      : `h-[clamp(3.5rem,9vw,5.25rem)] w-[clamp(3.1rem,8vw,4.625rem)] shrink-0 text-2xl sm:text-3xl `) +
    `disabled:cursor-not-allowed disabled:opacity-60`;

  return (
    <div className={isCompact ? "flex w-full min-w-0 flex-col items-start gap-1" : "flex w-full min-w-0 flex-col items-start gap-2"}>
      <div className={isCompact ? "text-sm font-normal leading-snug text-slate-800" : "text-[22px] font-normal leading-tight text-slate-800 sm:text-[28px]"}>
        {L.previous}
        {previousPeriod ? <span className="text-slate-400"> &gt; {previousPeriod}</span> : null}
        : <span className="font-bold text-slate-950"> {previousFormatted}</span>
      </div>
      <div className={isCompact ? "text-sm font-normal leading-snug text-slate-800" : "text-[22px] font-normal leading-tight text-slate-800 sm:text-[28px]"}>
        {L.current}
        {currentPeriod ? <span className="text-slate-400"> &gt; {currentPeriod}</span> : null}
      </div>

      {isCompact ? (
        <div className="mt-1.5 grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1 rounded-md bg-transparent py-0.5 min-[360px]:gap-2">
          <div className={`h-7 w-1 shrink-0 rounded-full ${styles.bar}`} aria-hidden />
          <div
            className="grid min-w-0 items-center gap-0.5 min-[360px]:gap-1"
            style={{
              gridTemplateColumns: decDigits > 0
                ? `repeat(${intDigits}, minmax(0, 1fr)) auto repeat(${decDigits}, minmax(0, 1fr))`
                : `repeat(${intDigits}, minmax(0, 1fr))`,
            }}
          >
            {ints.map((digit, i) => (
              <input
                key={`int-${i}`}
                ref={(el) => {
                  cellRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                disabled={disabled}
                value={digit}
                onChange={(e) => handleChange(i, e)}
                onKeyDown={(e) => handleKey(i, e)}
                onFocus={(e) => e.target.select()}
                className={cellClass}
                aria-label={`integer digit ${i + 1}`}
              />
            ))}
            {decDigits > 0 ? <span className={`px-0.5 text-center text-lg font-bold leading-none ${styles.separator}`}>,</span> : null}
            {decDigits > 0 ? decs.map((digit, i) => (
              <input
                key={`dec-${i}`}
                ref={(el) => {
                  cellRefs.current[intDigits + i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                disabled={disabled}
                value={digit}
                onChange={(e) => handleChange(intDigits + i, e)}
                onKeyDown={(e) => handleKey(intDigits + i, e)}
                onFocus={(e) => e.target.select()}
                className={cellClass}
                aria-label={`decimal digit ${i + 1}`}
              />
            )) : null}
          </div>
        </div>
      ) : (
        <div
          className="mt-5 flex w-full min-w-0 items-center overflow-x-auto rounded-2xl bg-white px-2 py-2 shadow-[0_2px_14px_rgba(15,23,42,0.08)]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className={`mx-1 mr-5 h-11 w-1.5 shrink-0 rounded-full ${styles.bar}`} aria-hidden />
          <div className="flex min-w-max flex-nowrap items-center gap-px min-[360px]:gap-1">
            {ints.map((digit, i) => (
              <input
                key={`int-${i}`}
                ref={(el) => {
                  cellRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                disabled={disabled}
                value={digit}
                onChange={(e) => handleChange(i, e)}
                onKeyDown={(e) => handleKey(i, e)}
                onFocus={(e) => e.target.select()}
                className={cellClass}
                aria-label={`integer digit ${i + 1}`}
              />
            ))}
            {decDigits > 0 ? <span className={`mx-3 shrink-0 text-3xl font-bold leading-none sm:text-4xl ${styles.separator}`}>,</span> : null}
            {decDigits > 0 ? decs.map((digit, i) => (
              <input
                key={`dec-${i}`}
                ref={(el) => {
                  cellRefs.current[intDigits + i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                disabled={disabled}
                value={digit}
                onChange={(e) => handleChange(intDigits + i, e)}
                onKeyDown={(e) => handleKey(intDigits + i, e)}
                onFocus={(e) => e.target.select()}
                className={cellClass}
                aria-label={`decimal digit ${i + 1}`}
              />
            )) : null}
          </div>
        </div>
      )}

      {(label || serialNumber) && (
        <div className={isCompact ? "ml-1 mt-1.5 text-sm font-normal leading-snug text-slate-800" : "ml-2 mt-4 text-[22px] font-normal leading-tight text-slate-800 sm:text-[28px]"}>
          {label}
          {serialNumber ? (
            <>
              : {L.serialPrefix} <span className="font-bold text-slate-950">{serialNumber}</span>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default MeterReadingInput;
