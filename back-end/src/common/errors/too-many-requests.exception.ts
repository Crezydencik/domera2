import { HttpException, HttpStatus } from '@nestjs/common';

/** HTTP 429 with a `retryAfter` (seconds) hint in the body. */
export class TooManyRequestsException extends HttpException {
  constructor(resetAt?: number, message = 'Too many requests') {
    const retryAfter =
      typeof resetAt === 'number' ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : undefined;
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        ...(retryAfter !== undefined ? { retryAfter } : {}),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
