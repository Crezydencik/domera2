# Domera — деплой и откат

Документ описывает порядок выката изменений оптимизации/безопасности (шаги 1–10 из
`PERFORMANCE_OPTIMIZATION_PLAN.md`, журнал внедрения), переменные окружения, миграции и откат.

## 1. Порядок выката

1. **Индексы Firestore** — заранее, до бэкенда (сборка индекса занимает минуты–часы):
   ```bash
   firebase deploy --only firestore:indexes
   ```
   Дождаться статуса *Enabled* в Firebase Console → Firestore → Indexes.
   Новые индексы: `invoices`/`documents` (collection group по `companyId`, `buildingId`, `ownerUserId` + `createdAt`),
   `email_logs` (`companyId` + `status`/`deliveryKey`/`type`), `notifications(userId, createdAt desc)`,
   `information_mailings(status, nextAttemptAt)` (collection group), field overrides для `notificationId`, `id` и т.п.
   **Не удалять** индексы, которые Firestore создал вручную по ссылкам из ошибок — `firebase deploy` спросит про удаление, отвечайте `N`.
2. **Переменные окружения** бэкенда в Vercel (раздел 2). Минимум: `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, проверить `CORS_ALLOWED_ORIGINS`.
3. **Бэкенд** (`back-end`, Vercel project API). Сначала Preview, прогон smoke-теста (раздел 5), затем Production.
4. **Фронтенд** (`frontendd`). Изменения фронтенда совместимы со старым бэкендом, но выкатывать после бэкенда.
5. **Миграции** (раздел 3) — после выката бэкенда, сначала dry-run.
6. **Cron** (раздел 4).
7. Через 1–2 недели стабильной работы — выключить legacy-чтения (`LEGACY_SCOPE_QUERIES=false`) и включить `APARTMENT_MEMBER_KEYS=true`.

## 2. Переменные окружения бэкенда

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | — | Список origin через запятую. Используется и CORS, и CSRF-проверкой Origin/Referer для небезопасных методов. Должен содержать `https://www.domera.lv` (и preview-домены, если нужны). |
| `SESSION_COOKIE_DOMAIN` | не задано | Домен session cookie. Обычно не нужен: фронтенд проксирует `/api/*` (first-party cookie). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | не заданы | Общий rate limit между инстансами Vercel. Без них лимит работает в памяти одного инстанса (слабее). |
| `RATE_LIMIT_KEY_PREFIX` | `rl:` | Префикс ключей в Redis (разные значения для preview/prod). |
| `RATE_LIMIT_REDIS_TIMEOUT_MS` | `400` | Таймаут Redis; при ошибке — fallback на память. |
| `RATE_LIMIT_MEM_MAX_ENTRIES` | `20000` | Размер in-memory лимитера. |
| `TRUST_PROXY_HEADERS` | `false` | `true` только за доверенным прокси (Vercel) — брать IP из `x-forwarded-for`. |
| `CRON_SECRET` | не задан | Секрет для `/api/internal/cron/*`. Без него эндпоинты отвечают 404. Vercel Cron сам шлёт `Authorization: Bearer $CRON_SECRET`. |
| `METER_REMINDER_CRON_DISABLED` | `false` | `true` выключает in-process `@Cron` напоминаний (на Vercel он всё равно не живёт между запросами — используйте Vercel Cron). |
| `MAILING_CRON_DISABLED` | `false` | То же для дорассылки информационных рассылок. |
| `MAILING_INLINE_BUDGET_MS` | `20000` | Сколько мс рассылка отправляет письма внутри HTTP-запроса (лимит функции 30 с). Остаток — через cron. |
| `MAILING_CONCURRENCY` | `5` | Параллельность отправки (1–20). Учитывайте лимиты Resend. |
| `BUILDING_STATS_TTL_MS` | `600000` | TTL кэша статистики домов. |
| `PLATFORM_ADMIN_CACHE_TTL_MS` | `300000` | TTL кэша списка платформенных админов. |
| `LEGACY_SCOPE_QUERIES` | `true` | Dual-read старых полей scope. `false` — только канонические поля (после миграции canonical-scope). |
| `APARTMENT_MEMBER_KEYS` | `false` | `true` — поиск квартир пользователя по индексу `memberKeys` (после миграции member-keys). |
| `PERFORMANCE_LOGS_ENABLED` | — | Логи тайминга запросов. |

Секреты (`FIREBASE_PRIVATE_KEY`, `RESEND_API_KEY`, `REGISTRATION_CODE_SECRET`, `CRON_SECRET`, токен Upstash) — только в Vercel Environment Variables, не в git.

## 3. Миграции

Все эндпоинты — только `PlatformAdmin`, ограничены `limit` и возвращают `nextCursor`. Без `apply=true` — dry-run (ничего не пишут).

```text
POST /api/buildings/admin/migrate/canonical-scope?limit=200            # dry-run
POST /api/buildings/admin/migrate/canonical-scope?limit=200&apply=true
POST /api/apartments/migrate/canonical-scope?limit=200&apply=true&cursor=<nextCursor>
POST /api/apartments/migrate/member-keys?limit=200&apply=true&cursor=<nextCursor>
```

Повторять с `cursor=<nextCursor>`, пока `nextCursor` не станет пустым. Миграции идемпотентны — повторный запуск безопасен.
Порядок: buildings canonical-scope → apartments canonical-scope → apartments member-keys → включить флаги из п.1.7.

## 4. Cron

На Vercel in-process `@Cron` не работает надёжно (функция засыпает), поэтому нужны Vercel Cron Jobs.
Добавьте в `back-end/vercel.json`:

```json
"crons": [
  { "path": "/api/internal/cron/meter-reading-reminders", "schedule": "*/15 * * * *" },
  { "path": "/api/internal/cron/information-mailings", "schedule": "*/5 * * * *" }
]
```

и задайте `METER_REMINDER_CRON_DISABLED=true`, `MAILING_CRON_DISABLED=true`.

> На тарифе **Hobby** Vercel разрешает только cron раз в сутки — тогда поставьте `"0 6 * * *"` или используйте внешний планировщик
> (GitHub Actions `schedule`, Upstash QStash, cron-job.org) с заголовком `Authorization: Bearer <CRON_SECRET>`.
> Поэтому `crons` не добавлен в `vercel.json` автоматически — неподдерживаемое расписание ломает деплой.

Рассылки: большая часть писем уходит сразу (в пределах `MAILING_INLINE_BUDGET_MS`). Если адресатов много, история
получает `status: "sending"`, и cron дорассылает оставшихся. Повторной отправки нет: каждый получатель помечается
`sent`/`failed`, плюс дедупликация по `deliveryKey` в `email_logs`.

## 5. Smoke-тест после выката

- Логин email/пароль и Google; logout; «запомнить меня».
- Каждая роль открывает dashboard, квартиры, показания, счета, документы, уведомления.
- Загрузка счёта (PDF и ZIP), скачивание PDF счёта.
- Отправка тестовой рассылке на 1–2 адреса; в истории `status: completed`.
- `curl -i https://<api>/api/internal/cron/information-mailings` без заголовка → `401`/`404`.
- POST с чужого Origin → `403`.

## 6. Откат

| Что сломалось | Действие |
|---|---|
| Любая регрессия бэкенда | Vercel → Deployments → предыдущий деплой → *Promote to Production* (мгновенно). |
| Пустые списки после выключения legacy | `LEGACY_SCOPE_QUERIES=true` (или удалить переменную), redeploy. |
| Не находятся квартиры пользователя | `APARTMENT_MEMBER_KEYS=false`. |
| Ошибки «query requires an index» | Индекс ещё строится — подождать или перейти по ссылке из ошибки. |
| CSRF 403 с легитимного домена | Добавить домен в `CORS_ALLOWED_ORIGINS`. |
| Проблемы с cron | `MAILING_CRON_DISABLED=true` / удалить `crons` из `vercel.json`. |

Данные миграций обратно совместимы (только добавляют поля), откат кода их не требует.

## 7. Запрет регистрации по паролю в обход приложения (рекомендация)

Firebase Auth позволяет создать аккаунт напрямую через публичный Web API key. Полностью выключить sign-up на клиенте
нельзя (Google sign-in создаёт аккаунт на клиенте), поэтому используйте blocking function (нужен Identity Platform):

```ts
// functions/src/index.ts  (firebase-functions v6+)
import { beforeUserCreated, HttpsError } from 'firebase-functions/v2/identity';

export const blockDirectPasswordSignUp = beforeUserCreated((event) => {
  const providerId = event.credential?.providerId ?? event.additionalUserInfo?.providerId;
  // Бэкенд создаёт пользователей через Admin SDK — blocking functions на него не срабатывают.
  if (providerId === 'password') {
    throw new HttpsError('permission-denied', 'Registration is only available through Domera.');
  }
});
```

```bash
firebase deploy --only functions:blockDirectPasswordSignUp
```

Перед включением проверьте, что регистрация в Domera создаёт пользователей через бэкенд (Admin SDK), а не `createUserWithEmailAndPassword` на клиенте —
иначе функция заблокирует и легитимную регистрацию.
