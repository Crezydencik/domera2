import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Guards HTTP cron triggers (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * 404 when CRON_SECRET is not configured, so the endpoints do not exist by default.
 */
export function assertCronSecret(authorization: string | undefined): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new NotFoundException();

  const provided = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!provided || !timingSafeEqual(digest(provided), digest(secret))) {
    throw new UnauthorizedException();
  }
}
