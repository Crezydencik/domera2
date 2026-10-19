import { HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { TooManyRequestsException } from '../../src/common/errors/too-many-requests.exception';
import { RateLimitService } from '../../src/common/services/rate-limit.service';

const req = { headers: {}, ip: '10.0.0.1' } as unknown as Request;

describe('RateLimitService (memory backend)', () => {
  let service: RateLimitService;
  beforeEach(() => (service = new RateLimitService()));
  afterEach(() => service.onModuleDestroy());

  it('allows up to the limit, then blocks', async () => {
    const key = service.buildKey(req, 'test', 'u1');
    for (let i = 0; i < 3; i += 1) expect((await service.consume(key, 3, 60_000)).allowed).toBe(true);
    const blocked = await service.consume(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('keeps separate counters per actor', async () => {
    await service.consume(service.buildKey(req, 'test', 'u1'), 1, 60_000);
    expect((await service.consume(service.buildKey(req, 'test', 'u2'), 1, 60_000)).allowed).toBe(true);
  });

  it('enforce() throws HTTP 429 with retryAfter', async () => {
    await service.enforce(req, 'scope', 'u1', 1);
    const error = await service.enforce(req, 'scope', 'u1', 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TooManyRequestsException);
    const http = error as TooManyRequestsException;
    expect(http.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((http.getResponse() as { retryAfter: number }).retryAfter).toBeGreaterThan(0);
  });
});
