"use client";

import { forwardRef } from "react";
import { Input, type InputProps } from "@/components/ui/input";

export const DEFAULT_PHONE_MAX_DIGITS = 11;

export function countPhoneDigits(value: string) {
  return value.replace(/\D/g, "").length;
}

export function sanitizePhoneInputValue(value: string, maxDigits = DEFAULT_PHONE_MAX_DIGITS) {
  let digitCount = 0;
  let nextValue = "";

  for (const char of value) {
    if (/\d/.test(char)) {
      if (digitCount >= maxDigits) continue;
      digitCount += 1;
      nextValue += char;
      continue;
    }

    if (char === "+" && nextValue.length === 0) {
      nextValue += char;
      continue;
    }

    if (/[\s().-]/.test(char)) {
      nextValue += char;
    }
  }

  return nextValue;
}

export interface PhoneInputProps extends Omit<InputProps, "type" | "inputMode"> {
  maxDigits?: number;
  onValueChange?: (value: string) => void;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ maxDigits = DEFAULT_PHONE_MAX_DIGITS, onChange, onValueChange, autoComplete = "tel", ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        onChange={(event) => {
          const sanitizedValue = sanitizePhoneInputValue(event.target.value, maxDigits);
          if (event.target.value !== sanitizedValue) {
            event.target.value = sanitizedValue;
          }
          onChange?.(event);
          onValueChange?.(sanitizedValue);
        }}
        {...props}
      />
    );
  }
);

PhoneInput.displayName = "PhoneInput";
