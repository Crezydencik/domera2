# Бек - адреса API

API-адрес - это URL, на который фронт отправляет запрос.

Базовый адрес в разработке:

`http://127.0.0.1:4000/api`

Авторизация:
- `POST /auth/login` - вход.
- `POST /auth/register` - регистрация.
- `GET /auth/account-catalog` - справочник вариантов аккаунта.
- `POST /auth/set-cookies` - выставить auth cookies.
- `POST /auth/session` - создать session cookie.
- `POST /auth/clear-cookies` - очистить cookies через POST.
- `DELETE /auth/session` - выйти.
- `POST /auth/register-email-code/request` - отправить код регистрации.
- `POST /auth/register-email-code/verify` - проверить код.
- `POST /auth/send-password-reset` - отправить восстановление пароля.
- `POST /auth/preview-password-reset` - проверить токен перед сбросом.
- `POST /auth/confirm-password-reset` - подтвердить новый пароль.
- `PATCH /auth/me/email` - начать смену email.
- `POST /auth/me/email/confirm` - подтвердить смену email.
- `PATCH /auth/me/password` - сменить пароль из кабинета.
- `GET /auth/docs-login` и `POST /auth/docs-login` - document login flow.

Пользователи:
- `GET /users/me` - текущий пользователь.
- `GET /users/by-email/search` - поиск пользователя по email.
- `PATCH /users/:userId/building-creation-access` - дать или снять доступ к созданию дома.
- `GET /users/:userId` - пользователь по id.
- `GET /users` - список пользователей.
- `POST /users/:userId/upsert` - создать или обновить профиль.
- `PATCH /users/:userId` - обновить пользователя.

Дома:
- `GET /buildings` - список домов.
- `GET /buildings/creation-access` - статус доступа на создание дома.
- `POST /buildings/creation-access/request` - запросить доступ на создание дома.
- `DELETE /buildings/creation-access/request/:requestId` - отменить запрос доступа.
- `GET /buildings/admin/all` - все дома для платформенного админа.
- `GET /buildings/admin/billing-invoices` - платформенные billing invoices по домам.
- `PATCH /buildings/admin/:buildingId/edit-lock` - переключить edit lock дома.
- `GET /buildings/:buildingId` - один дом.
- `POST /buildings` - создать дом.
- `PATCH /buildings/:buildingId` - обновить дом.
- `DELETE /buildings/:buildingId` - удалить дом.

Квартиры:
- `GET /apartments` - список квартир.
- `GET /apartments/:apartmentId` - одна квартира.
- `GET /apartments/:apartmentId/storage-summary` - сводка по файловому хранилищу квартиры.
- `POST /apartments` - создать квартиру.
- `PATCH /apartments/:apartmentId` - обновить квартиру.
- `PATCH /apartments/:apartmentId/owner` - назначить или обновить владельца.
- `DELETE /apartments/:apartmentId/owner` - убрать владельца.
- `POST /apartments/:apartmentId/owner/:ownerEmail/resend-invitation` - повторно отправить приглашение владельцу.
- `POST /apartments/import` - импорт квартир.
- `POST /apartments/:apartmentId/tenants/invite` - пригласить жильца.
- `PATCH /apartments/:apartmentId/tenants/:tenantUserId` - обновить жильца.
- `DELETE /apartments/:apartmentId/tenants/:tenantUserId` - удалить жильца из квартиры.
- `POST /apartments/:apartmentId/tenants/:tenantEmail/resend-invitation` - повторно отправить приглашение жильцу.
- `POST /apartments/:apartmentId/unassign-resident` - отвязать резидента.
- `GET /apartments/:apartmentId/audit-logs` - история действий.
- `POST /apartments/migrate/readable-ids` - техмаршрут миграции readable ids.

Показания:
- `GET /meter-readings` - список показаний.
- `GET /meter-readings/electricity-payments` - список оплат по электричеству.
- `POST /meter-readings/electricity-payments` - добавить оплату по электричеству.
- `PATCH /meter-readings/electricity-payments/:paymentId/confirm` - подтвердить оплату.
- `DELETE /meter-readings/electricity-payments/:paymentId` - удалить оплату.
- `POST /meter-readings` - добавить показание.
- `PATCH /meter-readings/:readingId` - изменить показание.
- `DELETE /meter-readings/:readingId` - удалить показание.
- `POST /meter-readings/test-reminder` - тест напоминания о показаниях.

Счета:
- `GET /invoices` - список счетов.
- `POST /invoices` - создать счет.
- `POST /invoices/upload` - загрузить счет вручную или через API.
- `POST /invoices/upload-batch` - пакетная загрузка счетов.
- `GET /invoices/uploads` - история загрузок.
- `GET /invoices/pending-approvals` - список счетов, ожидающих подтверждения.
- `GET /invoices/pending-approvals/:approvalId/pdf` - PDF для pending approval.
- `POST /invoices/pending-approvals/:approvalId/approve` - подтвердить один pending approval.
- `POST /invoices/pending-approvals/approve-all` - подтвердить все pending approvals.
- `POST /invoices/pending-approvals/cancel-all` - отменить все pending approvals.
- `DELETE /invoices/pending-approvals/:approvalId` - удалить один pending approval.
- `GET /invoices/public/:token/pdf` - публичный PDF счета по токену.
- `POST /invoices/:invoiceId/resend-email` - повторно отправить письмо со счетом.
- `GET /invoices/:invoiceId/pdf` - PDF счета по id.
- `GET /invoices/:invoiceId` - один счет.
- `PATCH /invoices/:invoiceId` - изменить счет.
- `DELETE /invoices/:invoiceId` - удалить счет.

Уведомления:
- `GET /notifications/settings` - настройки.
- `PATCH /notifications/settings` - изменить настройки.
- `GET /notifications` - список уведомлений.
- `POST /notifications` - создать уведомление.
- `PATCH /notifications/:notificationId/read` - отметить уведомление как прочитанное.
- `PATCH /notifications/read-all` - отметить все уведомления как прочитанные.
- `DELETE /notifications/:notificationId` - удалить уведомление.

Документы:
- `GET /documents` - список документов.
- `POST /documents/upload` - загрузить документ.
- `GET /documents/:documentId/download` - скачать или открыть документ.
- `DELETE /documents/:documentId` - удалить документ.
- `PATCH /documents/:documentId/access` - изменить доступ к документу.

Новости:
- `GET /news` - список новостей.
- `GET /news/:newsId` - одна новость.
- `POST /news` - создать новость.
- `PATCH /news/:newsId` - изменить новость.
- `DELETE /news/:newsId` - удалить новость.

Приглашения:
- `GET /invitations` - список resident-приглашений.
- `GET /invitations/by-email` - поиск приглашений по email.
- `POST /invitations/send` - отправить resident-приглашение.
- `GET /invitations/resolve` - проверить токен приглашения.
- `POST /invitations/accept` - принять приглашение.
- `PATCH /invitations/:invitationId/revoke` - отозвать приглашение.

Приглашения в компанию:
- `GET /company-invitations` - список приглашений в компанию.
- `POST /company-invitations/send` - отправить приглашение в компанию.
- `POST /company-invitations/accept` - принять приглашение в компанию.

Компания:
- `POST /company` - создать компанию.
- `GET /company/:companyId` - получить компанию.
- `PATCH /company/:companyId` - обновить компанию.
- `GET /company/:companyId/api-keys` - список API-ключей компании.
- `POST /company/:companyId/api-keys` - создать API-ключ.
- `DELETE /company/:companyId/api-keys/:keyId` - удалить API-ключ.
- `POST /company/:companyId/members` - добавить участника компании.
- `DELETE /company/:companyId/members/:memberId` - удалить участника компании.

Проекты:
- `GET /projects` - список проектов.
- `GET /projects/:projectId` - один проект.
- `POST /projects` - создать проект.
- `PATCH /projects/:projectId` - изменить проект.
- `DELETE /projects/:projectId` - удалить проект.

Resident:
- `GET /resident/apartments` - квартиры и дома текущего resident-пользователя.

Поддержка:
- `GET /support/feedback` - inbox обращений для PlatformAdmin.
- `GET /support/feedback/mine` - свои обращения компании.
- `POST /support/feedback` - создать обращение.
- `POST /support/feedback/:feedbackId/messages` - добавить сообщение в тред обращения.
- `PATCH /support/feedback/:feedbackId/complete` - закрыть обращение.

Связано с:
- [[Фронт - запросы к API]]
- [[Бек - модули]]
- [[Связь фронта и бека]]

