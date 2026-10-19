import { Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

const logger = new Logger('Background');

/**
 * Runs work that must not delay the HTTP response (audit logs, notification e-mails) without
 * losing it on serverless platforms.
 *
 * `void promise` is unsafe on Vercel: the function instance can be frozen right after the
 * response is sent, so audit records and e-mails were silently dropped. `waitUntil` keeps the
 * invocation alive until the promise settles; outside Vercel it is a no-op and the promise simply
 * runs in the background as before. Errors are logged, never thrown.
 */
export function runInBackground(task: Promise<unknown> | (() => Promise<unknown>), label = 'task'): void {
  let promise: Promise<unknown>;
  try {
    promise = typeof task === 'function' ? task() : task;
  } catch (error) {
    logger.warn(`background.${label}.failed reason=${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const guarded = Promise.resolve(promise).catch((error: unknown) => {
    logger.warn(`background.${label}.failed reason=${error instanceof Error ? error.message : String(error)}`);
  });

  try {
    waitUntil(guarded);
  } catch {
    // No request context (local server, tests): the promise keeps running on its own.
  }
}
