export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

export const PASSWORD_COMPLEXITY_MESSAGE =
  'Password must contain at least 8 characters, an uppercase letter, a lowercase letter, a number, and a special character.';
