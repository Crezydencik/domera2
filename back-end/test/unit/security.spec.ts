import { NotFoundException } from '@nestjs/common';
import { createCsrfOriginMiddleware } from '../../src/common/security/csrf-origin.middleware';
import { sanitizeMailingHtml } from '../../src/common/utils/mailing-html';
import { RateLimitService } from '../../src/common/services/rate-limit.service';
import { InvoicePdfStorageService } from '../../src/modules/invoices/services/invoice-pdf-storage.service';
import { RegistrationCodeService } from '../../src/modules/auth/services/registration-code.service';
import { FakeFirestore } from './fake-firestore';

describe('CSRF origin middleware', () => {
  const middleware = createCsrfOriginMiddleware((origin) => origin === 'https://app.domera.lv');
  const run = (method: string, headers: Record<string, string>) => {
    let status = 0;
    let passed = false;
    const response = { status: (code: number) => { status = code; return { json: () => undefined }; } };
    middleware({ method, headers } as never, response as never, () => { passed = true; });
    return { passed, status };
  };
  const cookie = { cookie: '__session=abc' };

  it('blocks cross-site cookie POST', () => expect(run('POST', { ...cookie, origin: 'https://evil.example' })).toEqual({ passed: false, status: 403 }));
  it('blocks Origin: null (sandboxed iframe / data: URL)', () => expect(run('POST', { ...cookie, origin: 'null' }).passed).toBe(false));
  it('blocks a foreign Referer when Origin is missing', () => expect(run('DELETE', { ...cookie, referer: 'https://evil.example/x' }).passed).toBe(false));
  it('allows the frontend origin', () => expect(run('POST', { ...cookie, origin: 'https://app.domera.lv' }).passed).toBe(true));
  it('ignores safe methods', () => expect(run('GET', { ...cookie, origin: 'https://evil.example' }).passed).toBe(true));
  it('ignores Bearer / API-key clients', () => {
    expect(run('POST', { ...cookie, origin: 'https://evil.example', authorization: 'Bearer t' }).passed).toBe(true);
    expect(run('POST', { 'x-api-key': 'k', origin: 'https://evil.example' }).passed).toBe(true);
  });
  it('ignores requests without the session cookie', () => expect(run('POST', { origin: 'https://evil.example' }).passed).toBe(true));
});

describe('sanitizeMailingHtml', () => {
  const xss = [
    'Привет <img src=x onerror=alert(1)//',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<svg onload=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="https://ok.lv" onclick="alert(1)">x</a>',
    '<p style="background:url(javascript:alert(1))">x</p>',
    '<iframe src=//evil>',
  ];
  it.each(xss)('neutralises %s', (payload) => {
    const html = `<td>${sanitizeMailingHtml(payload)}</td>`;
    // Every real tag in the output is an allowed one, without event handlers or js: URLs.
    const tags = html.match(/<\/?[a-z][^>]*>/gi) ?? [];
    for (const tag of tags) {
      expect(tag).toMatch(/^<\/?(td|b|strong|i|em|u|p|div|br|ul|ol|li|a)\b/i);
      expect(tag).not.toMatch(/\son\w+\s*=|javascript:/i);
    }
    // A stray "<" from the payload can no longer open a tag later in the template.
    expect(html.replace(/<\/?[a-z][^>]*>/gi, '')).not.toContain('<');
  });
  it('keeps allowed formatting and closes unbalanced tags', () => {
    expect(sanitizeMailingHtml('<p style="text-align:center">Hi <b>there</p><a href="https://x.lv">link</a> 1 < 2'))
      .toBe('<p style="text-align:center">Hi <b>there</b></p><a href="https://x.lv" style="color:#2563eb;text-decoration:underline;text-underline-offset:2px;">link</a> 1 &lt; 2');
  });
});

describe('invoice PDF serving', () => {
  const service = new InvoicePdfStorageService({} as never);
  it('serves only real PDF bytes, always as application/pdf', () => {
    expect(service.asPdfPayload(Buffer.from('%PDF-1.7 ...'), 'a.pdf').contentType).toBe('application/pdf');
    expect(() => service.asPdfPayload(Buffer.from('<html><script>alert(1)</script>'), 'a.pdf')).toThrow(NotFoundException);
  });
});

describe('registration code attempts', () => {
  it('parallel wrong guesses cannot exceed MAX_ATTEMPTS', async () => {
    const db = new FakeFirestore();
    const rateLimit = new RateLimitService();
    const service = new RegistrationCodeService(
      { firestore: db, auth: { getUserByEmail: async () => { throw new Error('none'); } } } as never,
      { get: () => undefined, getOrThrow: () => 'test-secret' } as never,
      rateLimit,
      { write: async () => undefined } as never,
      {} as never,
    ) as unknown as {
      verify(request: unknown, input: { email: string; code: string }): Promise<unknown>;
      makeDocId(email: string): string;
      hashCode(email: string, code: string): string;
    };
    const email = 'victim@example.com';
    db.store.set(`registration_email_codes/${service.makeDocId(email)}`, {
      codeHash: service.hashCode(email, '123456'), attempts: 0, expiresAt: { toMillis: () => Date.now() + 600_000 },
    });

    // 30 parallel guesses from 30 different IPs (rate limit is per IP); one of them is correct.
    const guesses = Array.from({ length: 30 }, (_, i) => (i === 29 ? '123456' : String(200000 + i)));
    const results = await Promise.allSettled(guesses.map((code, i) =>
      service.verify({ headers: {}, ip: `10.0.0.${i}` }, { email, code })));

    // The correct guess is the 30th: it must never be evaluated once 6 attempts were counted.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(0);
    expect((db.store.get(`registration_email_codes/${service.makeDocId(email)}`) as { attempts: number }).attempts).toBeLessThanOrEqual(6);
    rateLimit.onModuleDestroy();
  });
});
