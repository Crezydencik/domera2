import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthDocsLoginPageService {
  safeDocsNext(value: unknown): string {
    const next = typeof value === 'string' ? value.trim() : '';
    return next.startsWith('/api/docs') ? next : '/api/docs';
  }

  render(params: { next: string; error?: string }): string {
    const error = `<p class="error" role="alert"${params.error ? '' : ' hidden'}>${this.escapeHtml(params.error)}</p>`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Domera Swagger Login</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f8fb; color: #172033; }
    main { width: min(420px, calc(100vw - 32px)); background: white; border: 1px solid #dbe3ee; border-radius: 8px; padding: 28px; box-shadow: 0 18px 50px rgba(20, 30, 50, .08); }
    h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.2; }
    p { margin: 0 0 22px; color: #5d6b82; line-height: 1.5; }
    label { display: block; margin: 16px 0 6px; font-size: 14px; font-weight: 700; }
    input { box-sizing: border-box; width: 100%; height: 42px; border: 1px solid #c8d2df; border-radius: 6px; padding: 0 12px; font-size: 15px; }
    button { width: 100%; height: 44px; margin-top: 22px; border: 0; border-radius: 6px; background: #0f62fe; color: white; font-size: 15px; font-weight: 700; cursor: pointer; }
    button:hover { background: #004bd6; }
    .error { margin: 0 0 16px; padding: 10px 12px; border-radius: 6px; background: #fff1f1; color: #b42318; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>Swagger access</h1>
    <p>Sign in with a platform administrator account.</p>
    ${error}
    <form id="docs-login-form" method="post" action="/api/auth/login">
      <input type="hidden" name="next" value="${this.escapeHtml(params.next)}">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Open Swagger</button>
    </form>
  </main>
  <script>
    const form = document.getElementById('docs-login-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(formData.get('email') || ''),
          password: String(formData.get('password') || ''),
          rememberMe: true
        })
      });

      if (response.ok) {
        window.location.assign(String(formData.get('next') || '/api/docs'));
        return;
      }

      const payload = await response.json().catch(() => null);
      const message = payload && payload.message ? payload.message : 'Invalid email or password.';
      const errorBox = document.querySelector('.error');
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = Array.isArray(message) ? message.join(', ') : String(message);
      }
    });
  </script>
</body>
</html>`;
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
