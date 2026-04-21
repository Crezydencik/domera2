# Implementation Status Report

> This file is auto-generated. Do not edit it manually.
> Last updated: 19/04/2026, 15:26:54
> Refresh command: node tools/generate-implementation-report.mjs

## What is already implemented

- Backend modules detected: 13
- Frontend pages detected: 11
- Shared UI components detected: 12
- Locale files detected: 3

## How it is implemented

### Backend
- Stack: NestJS + TypeScript
- Pattern: module -> controller -> service
- Location: back-end/src/modules and back-end/src/common
- Auth and infrastructure are separated into reusable shared files

### Frontend
- Stack: Next.js App Router + TypeScript
- Pattern: app routes + reusable components + i18n messages
- Location: frontendd/src/app, frontendd/src/components, frontendd/messages

## Backend implementation details

### Apartments
- Module folder: back-end/src/modules/apartments
- Controller: yes
- Service: yes
- Base route: /apartments
- Already implemented:
  - GET /apartments — No summary provided
  - GET /apartments/:apartmentId — List apartments by company/building/resident
  - POST /apartments — Get apartment by id
  - PATCH /apartments/:apartmentId — Create apartment
  - DELETE /apartments/:apartmentId — Update apartment
  - POST /apartments/:apartmentId/tenants/invite — Delete apartment
  - DELETE /apartments/:apartmentId/tenants/:tenantUserId — Add or invite tenant by email
  - POST /apartments/:apartmentId/unassign-resident — Remove tenant from apartment
  - POST /apartments/import — Unassign resident from apartment

### Auth
- Module folder: back-end/src/modules/auth
- Controller: yes
- Service: yes
- Base route: /auth
- Already implemented:
  - POST /auth/set-cookies — No summary provided
  - POST /auth/session — Create secure Firebase session cookie from ID token
  - POST /auth/clear-cookies — Create session cookie using architecture-aligned endpoint
  - DELETE /auth/session — Clear auth and session cookies
  - POST /auth/register-email-code/request — Clear session using architecture-aligned endpoint
  - POST /auth/register-email-code/verify — Send registration email verification code
  - POST /auth/send-password-reset — Verify registration email code

### Buildings
- Module folder: back-end/src/modules/buildings
- Controller: yes
- Service: yes
- Base route: /buildings
- Already implemented:
  - GET /buildings — No summary provided
  - GET /buildings/:buildingId — List buildings by company
  - POST /buildings — Get building by id
  - PATCH /buildings/:buildingId — Create building
  - DELETE /buildings/:buildingId — Update building

### Company
- Module folder: back-end/src/modules/company
- Controller: yes
- Service: yes
- Base route: /company
- Already implemented:
  - POST /company — No summary provided
  - GET /company/:companyId — Create company
  - PATCH /company/:companyId — Get company by id

### Company Invitations
- Module folder: back-end/src/modules/company-invitations
- Controller: yes
- Service: yes
- Base route: /company-invitations
- Already implemented:
  - GET /company-invitations — No summary provided
  - POST /company-invitations/send — List company invitations for a building
  - POST /company-invitations/accept — Send a company invitation

### Invitations
- Module folder: back-end/src/modules/invitations
- Controller: yes
- Service: yes
- Base route: /invitations
- Already implemented:
  - GET /invitations — No summary provided
  - GET /invitations/by-email — List invitations by company
  - POST /invitations/send — Find invitation by email
  - GET /invitations/resolve — Send a resident invitation
  - POST /invitations/accept — Resolve invitation by token
  - PATCH /invitations/:invitationId/revoke — Accept invitation as existing user or during registration

### Invoices
- Module folder: back-end/src/modules/invoices
- Controller: yes
- Service: yes
- Base route: /invoices
- Already implemented:
  - POST /invoices — No summary provided
  - GET /invoices — Create an invoice
  - GET /invoices/:invoiceId — List invoices with optional filters
  - PATCH /invoices/:invoiceId — Get invoice by id
  - DELETE /invoices/:invoiceId — Update invoice fields

### Meter Readings
- Module folder: back-end/src/modules/meter-readings
- Controller: yes
- Service: yes
- Base route: /meter-readings
- Already implemented:
  - GET /meter-readings — No summary provided
  - POST /meter-readings — List meter readings for an apartment or company
  - PATCH /meter-readings/:readingId — Create meter reading entry
  - DELETE /meter-readings/:readingId — Update meter reading entry

### News
- Module folder: back-end/src/modules/news
- Controller: yes
- Service: yes
- Base route: /news
- Already implemented:
  - GET /news — No summary provided
  - GET /news/:newsId — List news by company
  - POST /news — Get news by id
  - PATCH /news/:newsId — Create news
  - DELETE /news/:newsId — Update news

### Notifications
- Module folder: back-end/src/modules/notifications
- Controller: yes
- Service: yes
- Base route: /notifications
- Already implemented:
  - GET /notifications — No summary provided
  - POST /notifications — Get notifications by user
  - PATCH /notifications/:notificationId/read — Create notification
  - PATCH /notifications/read-all — Mark notification as read
  - DELETE /notifications/:notificationId — Mark all notifications as read for user

### Projects
- Module folder: back-end/src/modules/projects
- Controller: yes
- Service: yes
- Base route: /projects
- Already implemented:
  - GET /projects — No summary provided
  - GET /projects/:projectId — List projects by company
  - POST /projects — Get project by id
  - PATCH /projects/:projectId — Create project
  - DELETE /projects/:projectId — Update project

### Resident
- Module folder: back-end/src/modules/resident
- Controller: yes
- Service: yes
- Base route: /resident
- Already implemented:
  - GET /resident/apartments — No summary provided

### Users
- Module folder: back-end/src/modules/users
- Controller: yes
- Service: yes
- Base route: /users
- Already implemented:
  - GET /users/:userId — No summary provided
  - GET /users/by-email/search — Get user by id
  - GET /users — Get user by email
  - POST /users/:userId/upsert — Get users by company
  - PATCH /users/:userId — Upsert user profile document

## Frontend routes already present

- / → frontendd/src/app/page.tsx
- /accept-invitation → frontendd/src/app/(auth)/accept-invitation/page.tsx
- /buildings → frontendd/src/app/(app)/buildings/page.tsx
- /dashboard → frontendd/src/app/(app)/dashboard/page.tsx
- /forgot-password → frontendd/src/app/(auth)/forgot-password/page.tsx
- /invoices → frontendd/src/app/(app)/invoices/page.tsx
- /login → frontendd/src/app/(auth)/login/page.tsx
- /meter-readings → frontendd/src/app/(app)/meter-readings/page.tsx
- /register → frontendd/src/app/(auth)/register/page.tsx
- /reset-password → frontendd/src/app/(auth)/reset-password/page.tsx
- /residents → frontendd/src/app/(app)/residents/page.tsx

## Shared components snapshot

- frontendd/src/components/app-shell.tsx
- frontendd/src/components/auth/auth-right-panel.tsx
- frontendd/src/components/dashboard-overview.tsx
- frontendd/src/components/data-table.tsx
- frontendd/src/components/locale-switcher.tsx
- frontendd/src/components/public-footer.tsx
- frontendd/src/components/public-heder.tsx
- frontendd/src/components/section-card.tsx
- frontendd/src/components/toast-provider.tsx
- frontendd/src/components/ui/alert-modal.tsx
- frontendd/src/components/ui/button.tsx
- frontendd/src/components/ui/input.tsx

## Locales

- en.json
- lv.json
- ru.json
