"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSWORD_COMPLEXITY_MESSAGE = exports.PASSWORD_COMPLEXITY_REGEX = void 0;
exports.PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;
exports.PASSWORD_COMPLEXITY_MESSAGE = 'Password must contain at least 8 characters, an uppercase letter, a lowercase letter, a number, and a special character.';
