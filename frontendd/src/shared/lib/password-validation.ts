export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

export function isStrongPassword(password: string): boolean {
  return PASSWORD_COMPLEXITY_REGEX.test(password);
}

export function getPasswordChecks(password: string) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^\w\s]/.test(password),
  };
}

export function getPasswordStrength(password: string): {
  score: number;
  label: "Empty" | "Weak" | "Medium" | "Strong";
} {
  const checks = getPasswordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;

  if (!password) {
    return { score: 0, label: "Empty" };
  }

  if (score <= 2) {
    return { score, label: "Weak" };
  }

  if (score <= 4) {
    return { score, label: "Medium" };
  }

  return { score, label: "Strong" };
}
