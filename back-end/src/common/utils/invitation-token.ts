import { createHash } from 'node:crypto';

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const hashInvitationToken = async (token: string): Promise<string> => {
  return createHash('sha256').update(token).digest('hex');
};
