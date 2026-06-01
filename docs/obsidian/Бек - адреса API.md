# Бек - адреса API

API-адрес - это URL, на который фронт отправляет запрос.

Базовый адрес в разработке:

`http://127.0.0.1:4000/api`

Авторизация:
- `POST /auth/login` - вход.
- `POST /auth/register` - регистрация.
- `POST /auth/session` - создать session cookie.
- `DELETE /auth/session` - выйти.
- `POST /auth/register-email-code/request` - отправить код регистрации.
- `POST /auth/register-email-code/verify` - проверить код.
- `POST /auth/send-password-reset` - отправить восстановление пароля.
- `POST /auth/confirm-password-reset` - подтвердить новый пароль.

Пользователи:
- `GET /users/me` - текущий пользователь.
- `GET /users/:userId` - пользователь по id.
- `GET /users` - список пользователей.
- `POST /users/:userId/upsert` - создать или обновить профиль.
- `PATCH /users/:userId` - обновить пользователя.

Дома:
- `GET /buildings` - список домов.
- `GET /buildings/:buildingId` - один дом.
- `POST /buildings` - создать дом.
- `PATCH /buildings/:buildingId` - обновить дом.
- `DELETE /buildings/:buildingId` - удалить дом.

Квартиры:
- `GET /apartments` - список квартир.
- `GET /apartments/:apartmentId` - одна квартира.
- `POST /apartments` - создать квартиру.
- `PATCH /apartments/:apartmentId` - обновить квартиру.
- `POST /apartments/import` - импорт квартир.
- `POST /apartments/:apartmentId/tenants/invite` - пригласить жильца.
- `GET /apartments/:apartmentId/audit-logs` - история действий.

Показания:
- `GET /meter-readings` - список показаний.
- `POST /meter-readings` - добавить показание.
- `PATCH /meter-readings/:readingId` - изменить показание.
- `DELETE /meter-readings/:readingId` - удалить показание.

Счета:
- `GET /invoices` - список счетов.
- `POST /invoices` - создать счет.
- `PATCH /invoices/:invoiceId` - изменить счет.
- `DELETE /invoices/:invoiceId` - удалить счет.

Уведомления:
- `GET /notifications` - список уведомлений.
- `POST /notifications` - создать уведомление.
- `GET /notifications/settings` - настройки.
- `PATCH /notifications/settings` - изменить настройки.

Связано с:
- [[Фронт - запросы к API]]
- [[Бек - модули]]
- [[Связь фронта и бека]]

