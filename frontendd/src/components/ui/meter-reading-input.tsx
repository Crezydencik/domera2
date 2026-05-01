"use client";

import React from "react";

export type MeterVariant = "cold" | "hot";

export interface MeterReadingInputProps {
  variant: MeterVariant;
  /** Label like "Холодная вода" / "Горячая вода" */
  label: string;
  /** Serial number shown after "Nr." */
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
  /** Localized labels */
  labels?: {
    previous?: string;
    current?: string;
    serialPrefix?: string;
  };
}

const VARIANT_STYLES: Record<MeterVariant, { bar: string; box: string; cell: string }> = {
  cold: {
    bar: "bg-blue-500",
    box: "border-blue-200",
    cell: "bg-blue-50 border-blue-400 focus:border-blue-500 focus:ring-blue-300/50",
  },
  hot: {
    bar: "bg-rose-500",
    box: "border-rose-200",
    cell: "bg-rose-50 border-rose-400 focus:border-rose-500 focus:ring-rose-300/50",
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
  labels,
}: MeterReadingInputProps) {
  const styles = VARIANT_STYLES[variant];
  const L = {
    previous: labels?.previous ?? "Предыдущее показание",
    current: labels?.current ?? "Текущее показание",
    serialPrefix: labels?.serialPrefix ?? "Nr.",
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
      ? "________"
      : String(previousValue);

  const cellClass =
    `text-center font-bold text-slate-800 outline-none transition border rounded focus:ring-2 ` +
    `${styles.cell} ` +
    `w-[clamp(1.8rem,5vw,2.5rem)] h-[clamp(2.2rem,7vw,2.8rem)] min-w-[1.5rem] min-h-[2rem] text-base sm:text-lg ` +
    `disabled:cursor-not-allowed disabled:opacity-60`;

  return (
    <div className="flex w-full flex-col items-start gap-1">
      <div className="text-[13px] sm:text-[14px] text-slate-700 font-normal">
        {L.previous}
        {previousPeriod ? <span className="text-slate-400"> &gt; {previousPeriod}</span> : null}
        : <span className="font-bold text-slate-900">{previousFormatted}</span>
      </div>
      <div className="text-[13px] sm:text-[14px] text-slate-700 font-normal">
        {L.current}
        {currentPeriod ? <span className="text-slate-400"> &gt; {currentPeriod}</span> : null}
      </div>

      <div
        className="mt-2 flex w-full items-center gap-1 rounded-lg bg-white px-1 py-1 shadow-sm overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch", boxShadow: "0 1px 4px #0001" }}
      >
        <div className={`mr-2 h-6 w-1 rounded ${styles.bar}`} aria-hidden />
        <div className="flex w-full flex-nowrap items-center gap-0.5">
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
          <span className="mx-1 align-middle text-base sm:text-lg font-bold text-slate-400">,</span>
          {decs.map((digit, i) => (
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
          ))}
        </div>
      </div>

      {(label || serialNumber) && (
        <div className="mt-1 ml-1 text-[13px] sm:text-[14px] text-slate-700 font-normal">
          {label}
          {serialNumber ? (
            <>
              : {L.serialPrefix} <span className="font-bold text-slate-900">{serialNumber}</span>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default MeterReadingInput;
