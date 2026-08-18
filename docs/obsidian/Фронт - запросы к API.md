# Фронт - запросы к API

Фронт не работает с базой напрямую.

Он вызывает бек через функции в `frontendd/src/shared/api`.

Главный клиент:
- `frontendd/src/shared/api/client.ts`

Он собирает URL, делает `fetch`, обрабатывает ошибки и возвращает данные.

Отдельные API-файлы:
- `auth.ts` - вход, регистрация, сессия, смена email и пароля.
- `buildings.ts` - дома.
- `apartments.ts` - квартиры, владельцы, жильцы, импорт, audit logs.
- `meters.ts` - показания счетчиков.
- `billing.ts` - счета, загрузки, pending approvals, PDF и email resend.
- `notifications.ts` - уведомления и настройки уведомлений.
- `company.ts` - компания и участники компании.
- `invitations.ts` - приглашения.
- `residents.ts` - жильцы через `/users`.
- `users.ts` - платформенные пользователи и building creation access.
- `projects.ts` - проекты.
- `news.ts` - новости.
- `documents.ts` - отдельный documents API.
- `support.ts` - support feedback и переписка по обращениям.

Что уже важно учитывать:
- не все запросы идут только из `frontendd/src/shared/api`: часть server-side чтения идет через `frontendd/src/shared/server/api-client`;
- есть Next API proxy-маршруты вроде `frontendd/src/app/api/invoices/[invoiceId]/pdf/route.ts`;
- публичные просмотры счетов и PDF используют токены и отдельные маршруты вне обычного кабинета.

Server-side данные:
- `frontendd/src/shared/lib/domera-api.server.ts`

Он используется там, где Next.js получает данные на сервере, например для dashboard.

Типовой путь:

Страница -> API-файл фронта -> адрес API -> контроллер бека -> сервис бека -> Firebase.

Связано с:
- [[Связь фронта и бека]]
- [[Бек - адреса API]]
- [[Бек - модули]]

