# План оптимизации производительности Domera

> Статус: аудит исходного кода завершён 10.10.2026; начато поэтапное внедрение безопасных оптимизаций. Все численные цели ниже должны быть заполнены базовыми замерами: в репозитории нет достоверной телеметрии, поэтому ускорение в процентах не заявляется.

## Карта работ

| № | Шаг | Приоритет | Сложность | Ожидаемый эффект |
|---:|---|---|---|---|
| 1 | Зафиксировать базовые метрики и трассировку | P0 | Низкая | Появится измеримый baseline |
| 2 | Разделить загрузчики по экрану и убрать `getRoleDataBundle()` | P0 | Средняя | Меньше HTTP, Firestore reads и RSC JSON |
| 3 | Убрать повторную загрузку профиля в layout | P0 | Низкая | Быстрее каждый защищённый переход |
| 4 | Сократить «все записи компании» и добавить cursor-пагинацию | P0 | Высокая | Масштабирование списков |
| 5 | Устранить N+1 в шапке уведомлений | P0 | Средняя | Меньше фоновой нагрузки |
| 6 | Индексы и предсказуемые сортировки Firestore | P0 | Средняя | Стабильные запросы без fallback |
| 7 | Ввести безопасный серверный кэш и инвалидацию | P1 | Средняя | Быстрее повторные SSR-запросы |
| 8 | Уменьшить стоимость авторизации | P1 | Средняя | Меньше удалённых проверок на каждый endpoint |
| 9 | Выделить компактные endpoint-ы представлений | P1 | Высокая | Меньше запросов и payload |
| 10 | Ленивые табы, клиентский cache и prefetch | P1 | Средняя | Быстрее навигация и TTI |
| 11 | Оптимизировать тяжёлые административные выборки | P1 | Высокая | Защита от роста Firestore reads |
| 12 | Оптимизировать Vercel/Next bundles и cold start | P2 | Средняя | Меньше TTFB/JS |
| 13 | Нагрузочные, регрессионные и security-проверки | P0 | Средняя | Безопасное внедрение |

Все пункты ниже оформлены как независимые задачи. Внедрять последовательно, через feature flag/малые PR, с измерением до и после каждого пункта.

## Журнал внедрения

- [x] 10.10.2026 — первый безопасный срез auth-навигации: `getAuthenticatedContext` мемоизирован на время одного SSR-render; app layout, support и реестр жителей используют claims из proxy и не требуют `/users/me` принудительно. Settings сохранён на fresh profile, так как отображает и редактирует профильные поля.
- [x] 10.10.2026 — первый срез фоновых запросов: устранён второй стартовый вызов `loadElectricitySetupNotifications`; polling уведомлений выполняется только в открытом popover и не чаще раза в минуту, с немедленным refresh при открытии.
- [x] 10.10.2026 — platform billing загружает список домов только при открытии вкладки документов.
- [x] Проверка первого среза: `npm --prefix frontendd run typecheck`, `npm --prefix frontendd run lint`, `npm --prefix frontendd run build`.
- [x] 10.10.2026 — добавлен `PerformanceMetricsInterceptor`: каждый Nest endpoint отвечает с `x-request-id` и `Server-Timing: app;dur=…`; при `PERFORMANCE_LOGS_ENABLED=true` пишет безопасные структурные duration/status/response-bytes логи без query, cookie и PII.
- [x] Проверка observability-среза: `npm --prefix back-end run typecheck`, `npm --prefix back-end run lint`, `npm --prefix back-end run build`.
- [x] 10.10.2026 — management registry квартир использует `/apartments?...&includeOwnerMetadata=false`. Убраны bulk owner-invitation queries и Firebase Auth lookups для каждой отображаемой квартиры; полные owner metadata запрашиваются через `GET /apartments/:id` только при открытии управления доступом. Старый API-контракт сохранён: metadata включается по умолчанию для остальных потребителей.
- [x] Проверка registry-среза: frontend/backend `typecheck` и `lint`; backend production build.
- [x] 10.10.2026 — добавлен platform-admin API `POST /apartments/migrate/canonical-scope`: bounded dry-run по cursor (default), а `apply=true` выполняет идемпотентный backfill `companyId`, `companyIds`, `buildingId`, `normalizedNumber` и `apartmentScopeVersion`. Legacy-поля не удаляются; записи без однозначного scope возвращаются в `skipped`.
- [x] 10.10.2026 — dashboard получил role-specific loaders: для УК загружаются только buildings, apartments и readings; для resident/landlord — жильё и readings; убраны invoices, news/documents, notifications и users, не используемые на первом экране. Карточка УК больше не создаёт последовательный запрос `/company/:id`.
- [x] 10.10.2026 — `GET /meter-readings` поддерживает необязательные `month` и `year`; dashboard запрашивает только текущий период. Исторические страницы API продолжают работать без параметров и получают полный набор показаний.
- [x] Проверка migration API: backend `typecheck`, `lint`, production build. Firebase migration не запускалась.
- [ ] Следующий этап: выполнить dry-run в staging, проверить `skipped`, затем запускать bounded batches в production и лишь после валидации вводить Firestore-native cursor pagination/API read models без dual-read.
- [x] 17.10.2026 — шаги 1–4: расписание напоминаний о показаниях с `METER_REMINDER_CRON_DISABLED`; invoices/documents читаются scoped-запросами (collection group по `companyId`/`buildingId`/`ownerUserId`) с limit/cursor; кэш статистики домов (`BUILDING_STATS_TTL_MS`) с инвалидацией на мутациях; флаг `LEGACY_SCOPE_QUERIES` для dual-read; `POST /buildings/admin/migrate/canonical-scope`; индекс `memberKeys` (`APARTMENT_MEMBER_KEYS`, миграция `POST /apartments/migrate/member-keys`); показания пишутся в транзакции.
- [x] 17.10.2026 — шаги 5–6: sanitizer payload (защищённые ключи), guard на `storagePath` счетов, `waitUntil` для фоновых задач, ограниченная параллельность рассылок; `count()`-агрегации вместо чтения коллекций; billing/deliveries одним запросом; TTL-кэши с de-dup in-flight; защита от zip-bomb по фактическим байтам.
- [x] 17.10.2026 — шаг 7: `InvoicesService` разделён (zip, PDF storage, история загрузок), общие helper-ы дат/значений, DI smoke-тест.
- [x] 17.10.2026 — шаги 8–9 (безопасность): CSRF-проверка Origin/Referer, PDF только по magic bytes + nosniff/CSP на API и на `/api/invoices/[id]/pdf` фронтенда, атомарный счётчик попыток кода регистрации, allow-list sanitizer рассылок (backend и preview на фронтенде), rate limit через Upstash Redis, migration-эндпоинты только для PlatformAdmin, `emailVerified` после подтверждения владения.
- [x] 17.10.2026 — шаг 10: очередь информационных рассылок (`companies/{id}/information_mailings/{id}/recipients`, статусы `sent/failed/pending`, дорассылка через `GET /api/internal/cron/information-mailings` под `CRON_SECRET`, lease 3 мин, без дублей); общий `assertCronSecret`; `filterByPeriod` учитывает legacy-показания без `month/year`; уведомления владельца о незаполненных показаниях — один запрос вместо N на квартиру (п. «N+1 уведомлений»); удалён неиспользуемый in-memory event bus; backend lint 0 ошибок.
- [x] 17.10.2026 — `firestore.indexes.json`: 13 composite-индексов и 6 field overrides (в т.ч. `notifications(userId, createdAt desc)`, `information_mailings(status, nextAttemptAt)`). Требуется `firebase deploy --only firestore:indexes`.
- [x] 17.10.2026 — CI (`.github/workflows/ci.yml`): backend typecheck/lint/test/build, frontend typecheck/build, lint фронтенда пока report-only (5 существующих ошибок React Compiler `preserve-manual-memoization` в meter-readings). Порядок выката, env, миграции и откат — `docs/DEPLOY.md`.
- [x] Проверка шагов 1–10: backend `typecheck`, `lint`, 72 unit-теста, build; frontend `typecheck`, `next build --webpack`, lint без новых ошибок.
- [ ] Не сделано намеренно (нужны ручные проверки UI/payload-ов): строгие DTO для оставшихся endpoint-ов, разбиение крупных frontend-файлов, перенос истории показаний в subcollection, исправление 5 ошибок React Compiler.

## 1. Краткое резюме проблем

Подтверждено чтением кода:

1. `getRoleDataBundle()` загружает до семи крупных коллекций для dashboard и используется также как основа ряда страниц. Для управляющей компании это `/buildings`, `/apartments`, `/users`, `/invoices`, `/meter-readings`, `/notifications`, `/news` одним `Promise.all`; результаты полностью сериализуются в RSC.
2. Большинство list-endpoint-ов не имеют `limit`, cursor и server-side сортировки. Firestore возвращает всю подходящую коллекцию, а фильтрация/сортировка происходит в Node/React.
3. Несколько endpoint-ов делают две legacy-выборки и объединяют их в памяти (`companyIds array-contains` и старый `companyId`). Это корректная миграционная совместимость, но двойная стоимость чтений.
4. Layout принудительно вызывает `/users/me` на каждом рендере защищённого сегмента, хотя proxy уже передаёт claims в заголовках. Одновременно дочерние загрузчики получают контекст повторно.
5. Header с уведомлениями запускает фоновый опрос каждые 30 секунд, при focus и изменениях, дополнительно загружая настройки, уведомления, pending approvals и здания. Для владельца он делает по запросу показаний на каждую квартиру.
6. `firestore.indexes.json` почти пуст. В production есть fallback при отсутствии индекса уведомлений, который вместо ограниченного отсортированного запроса читает до 500 записей.
7. Проверка Firebase session/token по умолчанию делает `checkRevoked=true` и имеет TTL 0. Это безопасная настройка, но потенциально добавляет удалённую проверку в каждый из параллельных HTTP-запросов SSR.

Это не означает, что каждая страница всегда медленна: фактические задержки зависят от количества данных, региона, warm/cold Vercel и Firestore. Ниже указано, что подтверждено кодом, а что необходимо измерить.

## 2. Текущая архитектура

```
Browser
  -> Next.js App Router on Vercel (`frontendd`)
     -> proxy.ts: cookie/JWT claims -> x-domera-* headers
     -> Server Component/page loader -> HTTPS fetch to Nest API
  -> rewrite /api/* -> NestJS Vercel Function (`back-end`)
     -> FirebaseAuthGuard -> Firestore / Firebase Storage
```

`frontendd/src/app/(app)/layout.tsx` оборачивает все защищённые страницы в sidebar и вызывает `getAuthenticatedContext(..., { requireFreshProfile: true })`. Page loaders затем вызывают `getAuthenticatedContext` ещё раз либо через `getRoleDataBundle()`. `react.cache(getCurrentProfile)` дедуплицирует `/users/me` лишь в рамках одного server-render, а переходы создают новые рендеры.

SSR API-клиент (`frontendd/src/shared/server/api-client.ts`) отправляет cookie в отдельный backend, обычно с `cache: "no-store"`; его process-local Map TTL 5 секунд и key включает весь Cookie. На serverless-инстансах он не является общим или гарантированным кэшем. Клиентский API-клиент имеет Map TTL 15 секунд, однако cache не разделён между вкладками и очищается на любой mutation.

### Охват защищённых маршрутов аудита

| Раздел | Route/page | Текущая загрузка | Особенность аудита |
|---|---|---|---|
| Общая оболочка | `(app)/layout.tsx`, sidebar | fresh `/users/me` + hook notifications | Общий overhead каждого защищённого route |
| Dashboard | `dashboard/page.tsx` | `getRoleDataBundle` | До 7 списков компании или resident fan-out |
| Дома | `buildings/page.tsx` | `/buildings` | Endpoint считает occupancy по квартирам |
| Квартиры | `apartments/page.tsx`, `[apartmentId]/page.tsx` | registry/resident bundle; client detail actions | Full list + owner/invitation enrichment; audit logs bounded не всегда |
| Жители | `residents/page.tsx` | buildings + apartments + users | Fresh profile, registry data |
| Счета и долги | `invoices/page.tsx`, `debts/page.tsx`, `meter-readings/invoices/page.tsx` | invoices bundle + uploads/approvals | Последовательные дополнительные запросы, большие таблицы |
| Электроэнергия | `electricity/page.tsx` | invoice bundle + `/company/:id` | Company call выполняется после loader |
| Показания | `meter-readings/page.tsx`, `building/page.tsx` | readings + buildings + apartments + company | Все показания embedded в квартирах |
| Документы | `documents/page.tsx` | registry/resident + documents | collection group + legacy collection + access loop |
| Уведомления | `notifications/page.tsx` | invoices + readings + notifications | Полные списки ради вычисленных карточек |
| Настройки | `settings/page.tsx` | buildings + users + page fetches | Fresh profile; вкладки следует загружать по требованию |
| Support | `support/page.tsx` | fresh profile; client inbox/form | Проверить polling inbox отдельно |
| Platform | `platform-users/page.tsx`, `admin-buildings/page.tsx`, `platform-billing/page.tsx`, `approvals/page.tsx` | client API / redirects | Admin services содержат full collection scans; approvals redirect |
| Redirect routes | `meter-readings/management-company`, `owner-landlord` | redirect | Не должны делать data fetch до redirect |

Публичные auth/PDF/invoice-public pages не входят в основной authenticated navigation, но перед выпуском необходимо отдельно проверить их cache headers, token validation и размер PDF/Storage response.

## 3. Обнаруженные узкие места

### Подтверждённые

| Проблема и критичность | Точное место | Почему замедляет / затрагивает | Исправление и риск |
|---|---|---|---|
| P0: избыточный role bundle | `frontendd/src/shared/lib/domera-api.server.ts:840`, функция `getRoleDataBundle` | Для management company до 7 endpoint-ов и полные массивы сущностей; dashboard, а также косвенно страницы, использующие loader. Объём RSC и reads растёт линейно с домами/квартирами. | Оставить bundle только для явно нужных dashboard summary; перейти на page-specific DTO. Риск: карточка может ожидать поле, не вошедшее в DTO — контракты типизировать и покрыть тестом по ролям. |
| P0: лишние запросы после bundle | `frontendd/src/app/(app)/invoices/page.tsx`, `electricity/page.tsx` | Invoice page последовательно после основного loader запрашивает uploads и approvals; electricity после `getInvoicesPageData` запрашивает company. Затронуты invoices/electricity. | Ленивая загрузка вкладок либо один view endpoint; параллелить независимое. Риск: не показывать данные до проверки прав. |
| P0: безлимитные списки | `back-end/src/modules/apartments/apartments.service.ts:1442`; `meter-readings/.../meter-reading-query.service.ts:20`; `documents/.../document-list.service.ts:19`; `news.service.ts:51` | `.get()` без cursor/limit читает все записи. Documents дважды читает до 200, затем для каждого документа вызывает async access check. Все реестры, показания, документы, новости. | Cursor pagination, `limit`, порядок и DTO. Риск: корректно переносить поиск/сортировку на backend. |
| P0: дорогая шапка / N+1 | `frontendd/src/shared/hooks/use-app-notifications.ts`, `loadOwnerMissingReadingStatus`; `refresh` | Каждые 30 сек/фокус: 2–4 endpoint-а; для владельца `/resident/apartments` + `/meter-readings?apartmentId=` для каждой квартиры. Все protected pages с sidebar. | Сводный endpoint unread/alerts, throttling и refresh только при открытии popover. Риск: допустимая свежесть должна быть согласована. |
| P0: отсутствуют declared composite indexes | `firestore.indexes.json`; `notification-repository.service.ts:24` | Только индекс `documents.createdAt`; при отсутствии индекса notifications код читает до 500 вместо ordered/limited query. Есть многопольные queries invitations, audit, email logs. | Сначала собрать реальные `FAILED_PRECONDITION`, добавить индексы в JSON и deploy. Риск: создание индекса занимает время; не удалять старые до миграции. |
| P1: лишняя свежая загрузка профиля | `frontendd/src/app/(app)/layout.tsx:6`; `auth-context.ts:103` | Layout всегда требует `/users/me`; residents/settings/support повторяют `requireFreshProfile`. Задержка backend + guard/Firestore на навигации. | Использовать в layout подписанные session claims; fresh profile только для экранов изменения профиля/после invalidation. Риск: stale company/role после изменения — rotate/reissue session и tag invalidate. |
| P1: проверка токена для каждого fan-out | `back-end/src/common/auth/firebase-auth.guard.ts:14-22, 65-105` | При `FIREBASE_CHECK_REVOKED` не false TTL auth cache = 0; SSR fan-out запускает несколько endpoint-ов, каждый проверяет session удалённо. | Принять security policy: короткий TTL только для verified session, немедленно очистить/отзывать сессию при критичных изменениях. Риск: окно revocation; согласовать с security owner. |
| P1: вычисление occupancy читает квартиры при загрузке зданий | `building-crud.service.ts:38-40`; `building-stats.service.ts:16` | `/buildings` параллельно читает все квартиры компании двумя запросами для статистики, даже если UI нужны только названия. | Денормализованный счётчик в building; отдельный summary endpoint. Риск: консистентность счётчика — batch/transaction + repair job. |
| P1: полные данные показаний | `meter-reading-query.service.ts:66-96`; `meter-readings.loader.ts:38` | Для компании читаются все квартиры и извлекаются все embedded readings; одновременно идут buildings/apartments/company. | `period`, `buildingId`, cursor, projection/summary. Риск: отчёты, которым нужна история, должны запрашивать её отдельно. |
| P1: двойная legacy-модель | `apartments.service.ts:1469-1471`, `building-crud.service.ts:45-48`, `invoices.service.ts:1188-1193` | `companyIds` плюс `companyId`, а также `managedBy.companyId` плюс `companyId`, удваивают reads и merge. | Миграция canonical fields с progress marker, затем постепенно убрать legacy path за flag. Риск: не потерять старые записи; dual-read до проверки полноты. |
| P2: process-local cache выдаёт ограниченный эффект | `frontendd/src/shared/server/api-client.ts:46-49`; `shared/api/client.ts:12-15` | Map не разделяется между Vercel instances/regions, server cache key включает cookie; default TTL 5 s. | Переходить на Next cache только для разрешённых user-scoped данных либо Redis/KV при необходимости. Риск: никакого public cache для private payload. |
| P2: холодный старт backend | `back-end/src/vercel.ts:4-15`; `back-end/vercel.json` | На cold start создаётся весь Nest app; `maxDuration` лишь ограничивает время. | Измерить отдельно и уменьшать module graph/инициализацию. Риск: не заменять Nest adapter без benchmark. |

### Гипотезы, требующие измерений

| Гипотеза | Где проверить | Метод подтверждения |
|---|---|---|
| Клиентский JS конкретных workspace слишком велик | `invoices/_invoices-workspace.tsx`, `documents/documents-workspace.tsx`, `meter-readings/*.tsx`, `admin-buildings/page.tsx` | `next build` + bundle analyzer; Chrome Coverage/Lighthouse production build. |
| RSC waterfall между layout и page вызывает заметный TTFB | App layout и все async `page.tsx` | Server-Timing вокруг loader/API + Chrome waterfall. |
| `withResolvedOwnerAccess` / `withOwnerInvitationDates` формируют N+1 | `apartments.service.ts:1489, 1510, 1532` | Логировать количество Firestore operations на один `/apartments`; нагрузочный test 100/1000 flats. |
| `DocumentAccessService.canAccessDocument` создаёт N+1 | `document-list.service.ts:46` | Trace/query counter на documents list; сравнить documents count vs reads. |
| Две Vercel deployments/регионы увеличивают RTT | `frontendd/next.config.ts` rewrite на `domeraback.vercel.app` | `Server-Timing`/Vercel logs из production региона, сравнить co-location. |

## 4. Целевая архитектура

1. **Identity context:** proxy передаёт только данные из подписанного session cookie; backend остаётся единственным источником авторизации. SSR не вызывает `/users/me`, пока claim version актуальна.
2. **Экранные read-модели:** `/dashboard/summary`, `/apartments?cursor&limit&buildingId`, `/meter-readings/summary?period`, `/notifications/summary`. Каждый возвращает минимальный DTO и metadata `{ nextCursor, total? }`.
3. **Firestore model:** canonical `companyId`, `buildingId`, `apartmentId`, `createdAt`; все list query фильтруются по tenant first, сортируются сервером, ограничиваются cursor. Счётчики/summary поддерживаются при записи.
4. **Cache:** private, user/company scoped keys; short stale-while-revalidate для read models; invalidate tag/event после mutation. Cookie-авторизованные ответы не получают `public, s-maxage`.
5. **UI:** Server Components отдают первый экран. Тяжёлые tab/modal/PDF/import динамически импортируются. Клиентский query cache использует initial server data и не refetch-ит сразу.
6. **Observability:** каждый API endpoint и Firestore operation имеют correlation id, duration, result size и reads (где возможно), без PII в логах.

Изоляция компаний всегда проверяется backend-ом до cache lookup. Cache key должен включать `uid`, effective `companyId`, role/permissions version и query parameters; ответы никогда не передаются между пользователями.

## 5. Пошаговая инструкция

### Шаг 1 — Измеримый baseline

- [ ] **Цель:** измерять, а не гадать.
- **Открыть:** `frontendd/src/shared/server/api-client.ts`, `back-end/src/main.ts`, `back-end/src/vercel.ts`, Vercel/Firebase dashboards.
- **Изменить:** добавить `Server-Timing` для SSR loader/API, structured logs `{requestId, route, durationMs, responseBytes, firestoreOperationCount}`; не логировать cookie, токены, e-mail или тела документов.
- **Создать/переработать:** Nest interceptor `PerformanceMetricsInterceptor`; helper `withFirestoreSpan()` вокруг крупных query paths.
- **Пример:**
  ```ts
  const started = performance.now();
  const result = await next.handle();
  response.setHeader('Server-Timing', `app;dur=${performance.now() - started}`);
  return result;
  ```
- **Зависимости:** не требуются; OpenTelemetry — отдельное решение после POC.
- **Проверка:** открыть production-like environment, увидеть Server-Timing и один JSON log на endpoint.
- **Регрессия:** smoke login + по одному экрану для platform admin, management company, accountant, landlord, resident.
- **Сравнить до/после:** navigation TTFB, endpoint duration/p50/p95, Firestore reads, response bytes, JS transfer.
- **Готово, когда:** baseline таблица ниже заполнена для всех маршрутов.

### Шаг 2 — Убрать универсальный большой bundle

- [ ] **Цель:** грузить ровно данные экрана.
- **Открыть:** `frontendd/src/shared/lib/domera-api.server.ts:598-1012`, все файлы `frontendd/src/shared/server/page-loaders/`, `dashboard/role-dashboard.tsx`.
- **Изменить:** оставить `getRoleDataBundle()` временно только как deprecated adapter dashboard; для dashboard создать `getDashboardSummaryData`, для других страниц — точные loaders без invoices/readings/news «на всякий случай».
- **Создать:** DTO `DashboardSummary`, `ApartmentListItem`, `InvoiceListItem`; contract tests на сериализацию по ролям.
- **Пример:**
  ```ts
  // dashboard.loader.ts
  export const getDashboardSummaryData = (ctx: AuthenticatedContext) =>
    apiFetch<DashboardSummary>(`/dashboard/summary?companyId=${encodeURIComponent(ctx.companyId!)}`);
  ```
- **Зависимости:** не требуются.
- **Проверка:** Network/RSC payload dashboard содержит summary, а не списки всех квартир/счетов.
- **Регрессия:** сравнить видимые KPI и role-specific action для каждой роли.
- **Сравнить:** число backend requests, JSON/RSC bytes, reads и TTFB.
- **Готово, когда:** dashboard не зависит от полного списка apartments/invoices/readings/documents.

### Шаг 3 — Один auth context на render

- [ ] **Цель:** исключить ненужный `/users/me` в layout и page loaders.
- **Открыть:** `frontendd/src/app/(app)/layout.tsx`, `frontendd/src/shared/server/auth-context.ts`, `frontendd/src/proxy.ts`.
- **Изменить:** layout использовать header-derived context, не `requireFreshProfile`; fresh path оставить только для profile/settings mutations. Передать context provider либо принять context в loader.
- **Создать:** `getRequestAuthContext = cache(...)` с явным `fresh: boolean`; endpoint/session mechanism, который обновляет claims после изменения роли/company.
- **Пример:**
  ```ts
  export const getRequestAuthContext = cache((fresh = false) =>
    getAuthenticatedContext(undefined, { requireFreshProfile: fresh }),
  );
  ```
- **Зависимости:** нет.
- **Проверка:** один route render не делает два `/users/me`; переход dashboard → invoices сохраняет auth UX.
- **Регрессия:** изменение роли/компании, logout, expired session и accountant permissions.
- **Сравнить:** count `/users/me`, auth guard duration, TTFB.
- **Готово, когда:** fresh profile запрашивается только по обоснованным сценариям.

### Шаг 4 — Пагинация и bounded queries

- [ ] **Цель:** исключить загрузку всей компании.
- **Открыть:** `back-end/src/modules/apartments/apartments.service.ts:1442`, `meter-reading-query.service.ts`, `documents/document-list.service.ts`, `news.service.ts`, frontend tables/workspaces.
- **Изменить:** принять `limit` (max 100), opaque `cursor`, `sort`; использовать `orderBy`, `startAfter`, `limit(limit + 1)`. Default не должен быть «всё».
- **Создать:** общий `CursorPage<T>` и `decodeCursor/encodeCursor`; API version/compatibility: старый response временно оставить с default first page.
- **Пример:**
  ```ts
  let q = db.collection('apartments').where('companyId', '==', companyId)
    .orderBy('normalizedNumber').limit(limit + 1);
  if (cursor) q = q.startAfter(decodeCursor(cursor));
  ```
- **Зависимости:** нет.
- **Проверка:** 101 запись возвращается двумя страницами без дублей/пропусков.
- **Регрессия:** фильтр building, resident access, legacy records и сортировка номера квартиры.
- **Сравнить:** reads, bytes, p95 для 10/100/1000 записей.
- **Готово, когда:** каждый production list endpoint имеет enforced upper limit и cursor.

### Шаг 5 — Уведомления без постоянного fan-out и N+1

- [ ] **Цель:** сделать sidebar дешёвым.
- **Открыть:** `frontendd/src/shared/hooks/use-app-notifications.ts`, `frontendd/src/app/(app)/_components/sidebar.tsx`, notifications services/controllers.
- **Изменить:** не запускать `refresh` на mount каждые 30s для всех страниц; загружать detail при открытии popover, ограничить повторный refresh и отменять запросы. Вынести missing readings в server aggregate.
- **Создать:** `GET /notifications/summary` с `unreadCount`, preview ≤5, pending approvals count и `missingReadingsCount`; endpoint считает данные одним bounded query/денормализованным счётчиком.
- **Пример:**
  ```ts
  const shouldRefresh = isOpen && Date.now() - lastFetchAt > 60_000;
  if (shouldRefresh) void refreshSummary();
  ```
- **Зависимости:** нет.
- **Проверка:** при загрузке любой страницы нет O(квартиры) запросов; popover показывает актуальные 5 уведомлений.
- **Регрессия:** read/delete, owner reminders, platform approvals, focus/tab restore.
- **Сравнить:** requests/min/user, reads per sidebar render, CPU browser.
- **Готово, когда:** sidebar выполняет максимум один summary request в выбранный интервал.

### Шаг 6 — Firestore indexes и query contracts

- [ ] **Цель:** устранить index fallback и обеспечить query plan.
- **Открыть:** `firestore.indexes.json`, `notification-repository.service.ts`, `apartment-invitation.service.ts`, `email-log.service.ts`, `apartments.service.ts`.
- **Изменить:** добавить только индексы, подтверждённые staging/prod error links; начать с `(userId ASC, createdAt DESC)` для legacy notifications и индексов пагинации lists. Удалить catch fallback на 500 записей только после deploy индекса.
- **Создать:** CI check, который валидирует JSON; runbook «FAILED_PRECONDITION → index → deploy → verify».
- **Пример:**
  ```json
  {"collectionGroup":"notifications","queryScope":"COLLECTION","fields":[
    {"fieldPath":"userId","order":"ASCENDING"}, {"fieldPath":"createdAt","order":"DESCENDING"}
  ]}
  ```
- **Зависимости:** Firebase CLI уже используется проектом.
- **Проверка:** staging выполняет ordered query без exception/fallback.
- **Регрессия:** rules deploy не меняется; проверить queries каждой роли.
- **Сравнить:** fallback count, reads/query, Firestore latency.
- **Готово, когда:** нет runtime index fallback на hot paths.

### Шаг 7 — Private cache с инвалидацией

- [ ] **Цель:** использовать повторные чтения безопасно.
- **Открыть:** оба `api-client.ts`, all mutation API wrappers, Next cache documentation версии 16 из `frontendd/node_modules/next/dist/docs/`.
- **Изменить:** не полагаться на process-local Map как на межинстансный cache. Для read model применить tag/cache только к неперсональным или строго user-scoped данным; mutation инвалидирует соответствующие tags.
- **Создать:** key convention `domera:{uid}:{companyId}:{permissionVersion}:{resource}:{paramsHash}` и mapping mutation → tags.
- **Пример:**
  ```ts
  apiFetch(`/buildings?companyId=${id}`, { revalidate: 30, tags: [`company:${id}:buildings`] });
  // after mutation: revalidateTag(`company:${id}:buildings`)
  ```
- **Зависимости:** нет; KV добавлять лишь после измеренного cache-miss/cold-start сценария.
- **Проверка:** второй load быстрее, mutation сразу обновляет экран.
- **Регрессия:** два пользователя разных компаний не видят данные друг друга; проверить private response headers.
- **Сравнить:** cache hit rate, TTFB cold/warm, stale incidents.
- **Готово, когда:** cache scope и invalidation задокументированы для каждого cached endpoint.

### Шаг 8 — Политика auth verification

- [ ] **Цель:** уменьшить лишние remote Firebase auth calls без ослабления модели вслепую.
- **Открыть:** `firebase-auth.guard.ts`, `main.ts`, auth session services, security requirements.
- **Изменить:** после security review проверить вариант `FIREBASE_CHECK_REVOKED=false` + bounded auth cache 30–60 s только на server instance; при password/role/company deactivation — revoke Firebase refresh tokens, удалить session, increment permission version.
- **Создать:** threat-model/runbook и integration test revoked session.
- **Пример:**
  ```ts
  // only after approved risk decision
  FIREBASE_CHECK_REVOKED=false
  FIREBASE_AUTH_CACHE_TTL_MS=30000
  ```
- **Зависимости:** нет.
- **Проверка:** valid cookie avoids duplicate verification inside burst; revoked/expired session still redirects promptly according to policy.
- **Регрессия:** login/logout/password reset/account disable/role change.
- **Сравнить:** guard duration and Firebase Auth calls/request.
- **Готово, когда:** security owner письменно утвердил допустимое окно revocation или решение оставлено без изменений.

### Шаг 9 — Компактные view endpoints и денормализованные summary

- [ ] **Цель:** заменить fan-out на один role-aware запрос там, где это окупается.
- **Открыть:** `getManagementRegistryData`, invoices/electricity pages, `BuildingStatsService`, modules invoices/buildings/meter-readings.
- **Изменить:** реализовать `/dashboard/summary`, `/invoices/workspace?tab=...`, `/meter-readings/summary`; payload формируется на backend после одной проверки scope.
- **Создать:** `DashboardReadModelService`; precomputed counters `apartmentsCount`, `occupiedApartments`, unread count, missing readings by period.
- **Пример:**
  ```ts
  return { kpis, recentInvoices: invoices.slice(0, 5), alerts, updatedAt: new Date().toISOString() };
  ```
- **Зависимости:** нет.
- **Проверка:** endpoint не раскрывает raw apartment/user fields, которые экран не использует.
- **Регрессия:** role matrix и tenancy test for every query parameter.
- **Сравнить:** HTTP count/page, serialized bytes, reads/page.
- **Готово, когда:** hot dashboard/Invoices/load first tab используют один bounded read model.

### Шаг 10 — UI prefetch, tabs и bundle budget

- [ ] **Цель:** сделать переходы воспринимаемо мгновенными без перегрузки сети.
- **Открыть:** sidebar, `invoices/_invoices-workspace.tsx`, `documents/documents-workspace.tsx`, `meter-readings` workspaces, `frontendd/next.config.ts`.
- **Изменить:** использовать Next `<Link>` для eligible navigation; dynamic import тяжёлых modal/import/PDF/tab компонентов; не refetch initialData автоматически в `useDomeraQuery` — добавить `revalidateOnMount` по staleTime.
- **Создать:** bundle budget CI (per route JS/RSC warning) и route prefetch policy.
- **Пример:**
  ```ts
  const InvoiceImportDialog = dynamic(() => import('./invoice-import-dialog'), { ssr: false });
  ```
- **Зависимости:** bundle analyzer — dev-only по необходимости.
- **Проверка:** Chrome network показывает chunk только после открытия соответствующей вкладки.
- **Регрессия:** keyboard navigation, no-JS fallback where required, invoice PDF/download.
- **Сравнить:** transferred JS, INP/LCP, navigation time warm cache.
- **Готово, когда:** бюджет определён и не растёт в CI без явного approval.

### Шаг 11 — Legacy migration и тяжёлые admin paths

- [ ] **Цель:** постепенно прекратить dual reads и full scans.
- **Открыть:** `apartments.service.ts`, `building-crud.service.ts`, `invoices.service.ts`, `building-admin.service.ts`, `apartments.service.ts:2723`.
- **Изменить:** backfill canonical `companyId`, `buildingId`, `normalizedNumber`; record migration version; read new field first, dual-read только для version < target. Для platform admin внедрить pagination/aggregate вместо `buildings.get()`/`companies.get()`.
- **Создать:** idempotent migration job with dry-run, checkpoint, error report and rollback mapping.
- **Пример:**
  ```ts
  if (doc.data().schemaVersion >= 2) return canonicalQuery;
  return merge(canonicalQuery, legacyQuery); // temporary, instrumented
  ```
- **Зависимости:** Firebase Admin SDK уже есть.
- **Проверка:** dry-run совпадает по IDs с dual-read; backfill можно повторить.
- **Регрессия:** legacy apartments, invoices, managedBy-only buildings, owner/resident access.
- **Сравнить:** count dual reads, reads per list, data mismatch count.
- **Готово, когда:** 100% verified active docs on canonical schema и legacy path отключён feature flag-ом.

### Шаг 12 — Vercel/Next deployment tuning

- [ ] **Цель:** уменьшить cold-start и межсервисную задержку на основании данных.
- **Открыть:** `back-end/src/vercel.ts`, `back-end/vercel.json`, `frontendd/vercel.json`, `frontendd/next.config.ts`.
- **Изменить:** сначала co-locate frontend/backend/Firebase region если Vercel configuration это позволяет; разделить тяжёлые admin/import endpoints от hot read handler лишь если trace показывает пользу; исключить неиспользуемые зависимости из server graph.
- **Создать:** deployment checklist с cold/warm probes.
- **Пример:** `curl -w '%{time_starttransfer}\n'` выполнять из одинакового региона в CI/monitor, не из локальной машины.
- **Зависимости:** Vercel observability/analytics по выбранному тарифу.
- **Проверка:** cold vs warm tagged in logs; build produces no unexpected large chunks.
- **Регрессия:** rewrites `/api`, cookies, CORS, maxDuration, Storage/PDF route.
- **Сравнить:** cold TTFB, init duration, backend-to-Firestore RTT.
- **Готово, когда:** выбранная конфигурация подтверждена сравнительными traces, а не предположением.

### Шаг 13 — Rollout и rollback

- [ ] **Цель:** выпускать без нарушения business logic.
- **Открыть:** все changed modules, Vercel/Firebase release pipeline.
- **Изменить:** feature flags `readModelsV2`, `cursorPaginationV2`, `authCachePolicyV2`; сначала shadow-read/compare, затем canary по company allowlist.
- **Создать:** dashboard mismatch alert и runbook rollback.
- **Пример:** `if (flags.readModelsV2) return v2; return legacy;` — только на переходный период и с датой удаления.
- **Зависимости:** существующий config/env mechanism или выбранный flag service.
- **Проверка:** canary role matrix, error rate, response consistency.
- **Регрессия:** API consumers сохраняют старый contract до объявленного срока.
- **Сравнить:** errors, p95, reads, mismatches before/after flag.
- **Готово, когда:** rollout/rollback выполняется конфигурацией без data loss.

## 6. Примеры обязательных контрактов

```ts
// Пагинированный ответ — не передавать все документы в UI.
export type CursorPage<T> = {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
};

// Cache key обязан включать scope; shared public Cache-Control запрещён.
type ScopedRead = { uid: string; companyId?: string; permissionVersion: number };
```

```ts
// После изменения данных: точечная invalidation, а не clear всего client cache.
invalidateDomeraQuery(`/apartments?companyId=${companyId}`);
invalidateDomeraQuery(`/dashboard/summary?companyId=${companyId}`);
```

Не применять `unstable_cache`/`revalidate` к ответам, где identity берётся из cookie, без user/company/permission version в ключе и без tests на cross-tenant isolation.

## 7. План тестирования и таблица baseline

### Сценарии

1. Для каждой роли пройти: dashboard, sidebar navigation, buildings, apartments, apartment detail, residents, invoices, electricity, meter readings, documents, notifications, settings, support и platform screens, если доступны.
2. Тестировать пустую компанию, типичную компанию и синтетическую большую: ≥100 зданий, ≥10 000 квартир, достаточная история readings/invoices/documents.
3. Для каждого route собрать cold first visit, warm repeat, client navigation, throttled 4G и desktop/mobile. Записывать TTFB, LCP, INP, CLS, transferred bytes, requests, API p50/p95, Firestore reads/query.
4. Нагрузочно проверить cursor pagination, concurrent mutations, notification refresh и auth revocation.
5. Запустить existing `npm --prefix frontendd run lint/typecheck/build` и backend аналогично; добавить integration tests endpoint scope + e2e role smoke.

| Маршрут / роль | Cold TTFB до/после | Warm TTFB до/после | Переход до/после | HTTP до/после | API p95 до/после | Firestore reads до/после | RSC/JSON bytes до/после | CWV до/после | Статус |
|---|---|---|---|---|---|---|---|---|---|
| Dashboard / management company | — | — | — | 7+ → 3 | — | — | — | — | - [x] код; нужны production-замеры |
| Apartments / management company | — | — | — | — | — | — | — | — | - [ ] |
| Invoices / management company | — | — | — | — | — | — | — | — | - [ ] |
| Meter readings / management company | — | — | — | — | — | — | — | — | - [ ] |
| Documents / management company | — | — | — | — | — | — | — | — | - [ ] |
| Dashboard / resident | — | — | — | 5+ → 2 | — | — | — | — | - [x] код; нужны production-замеры |
| Meter readings / owner-landlord | — | — | — | — | — | — | — | — | - [ ] |
| Platform admin screens | — | — | — | — | — | — | — | — | - [ ] |

**Cold start:** отдельная колонка/trace: function init duration, first backend response, first Firestore query. Не смешивать с browser cache. **Core Web Vitals:** полевые RUM-данные и lab Lighthouse хранить раздельно.

## 8. Риски и способы отката

| Изменение | Риск | Защита и откат |
|---|---|---|
| Пагинация | пропуск/дубликат данных при изменениях между страницами | stable `orderBy` + document id tiebreaker; feature flag на legacy list |
| Read-model | различие с legacy UI | shadow compare и contract tests; вернуть legacy loader flag-ом |
| Кэш | утечка данных компаний или stale access | scope key + private cache + permission version; немедленно отключить tag/cache flag |
| Auth cache | revoked access живёт до TTL | security-approved TTL, session revoke, нулевой TTL rollback env |
| Canonical schema migration | неполный backfill | idempotent dry-run/checkpoint, dual-read до 100% validation |
| Индексы | build ещё не завершился | deploy indexes заранее, не удалять fallback до ready |

## 9. Чек-лист реализации

- [ ] Baseline заполнен и опубликован.
- [ ] На hot paths есть request id, timing, payload size и Firestore query telemetry.
- [ ] Все production lists имеют limit/cursor/sort и tenant filter.
- [x] Dashboard не загружает неиспользуемые invoices/documents/news/notifications/users; sidebar оптимизирован отдельно. Полный pagination/summary DTO ещё требуется.
- [ ] Уведомления не делают N+1 на количество квартир.
- [ ] Все required Firestore indexes объявлены и deployed.
- [ ] Cache keys scoped к identity/tenant/permission version; mutation invalidates tags.
- [ ] Auth-cache policy одобрена security owner.
- [ ] Legacy dual-read имеет migration metric и дату удаления.
- [ ] Все роли прошли e2e access matrix; межкомпанейная изоляция протестирована.
- [ ] Cold/warm Vercel измерены отдельно.
- [ ] Rollback флаги протестированы до production rollout.

## 10. Критерии успешной оптимизации

Работа считается завершённой не по заявленному множителю ускорения, а когда:

1. Для каждого маршрута есть заполненное до/после измерение и нет ухудшения без согласованного объяснения.
2. UI first screen использует bounded DTO, pagination и минимум независимых запросов.
3. Firestore reads на hot paths ограничены размером страницы/summary, а не размером всей компании.
4. Нет fallback-а на сотни документов из-за отсутствующего индекса.
5. Кэш не допускает публичного хранения private data и проверен negative tests между компаниями/ролями.
6. Existing функции, Firebase Authentication, роли, API consumers и rollback остаются работоспособны.
