# Domera Backend (NestJS)

Standalone NestJS backend service for the Domera platform, with domain-oriented modular architecture and shared infrastructure.

## Quick Start

1. Install dependencies:

   - `npm install`

2. Create environment file:

   - copy `.env.example` to `.env`
   - fill Firebase credentials

3. Start in development mode:

   - `npm run start:dev`

4. Build and run production bundle:

   - `npm run build`
   - `npm run start`

Default API base: `http://localhost:4000/api`

OpenAPI/Swagger UI: `http://localhost:4000/api/docs`

## Scripts

- `npm run start` — run compiled app
- `npm run start:dev` — start Nest watch mode
- `npm run build` — compile TypeScript to `dist`
- `npm run typecheck` — TypeScript checks without emit
- `npm run lint` — lint source files

## Module Layout

Domain modules (independent):

- `auth`
- `invitations`
- `company-invitations`
- `apartments`
- `invoices`
- `meter-readings`
- `resident`

Shared infrastructure:

- `src/common/infrastructure/firebase` — Firebase Admin integration
- `src/common/auth` — auth + role guards
- `src/common/services` — rate limiting + audit logging
- `src/common/utils` — cross-domain helper functions

## Documentation Index

Comprehensive backend documentation is available in `docs/`:

- `docs/ARCHITECTURE.md` — architecture and module boundaries
- `docs/API_REFERENCE.md` — endpoint-by-endpoint API contract
- `docs/SECURITY.md` — security model and hardening guidance
- `docs/CONFIGURATION.md` — environment and runtime config
- `docs/RUNBOOK.md` — local/dev/prod operational runbook
- `docs/MIGRATION_STATUS.md` — migration progress from legacy API
- `docs/SWAGGER.md` — OpenAPI/Swagger usage and configuration

## Notes

- API prefix is `/api` (configured in `src/main.ts`).
- Global validation pipe is enabled (`class-validator` DTO validation).
- Auth supports Firebase session cookie (`__session`) and Bearer token fallback.
- Swagger UI is served at `/api/docs` (can be disabled with `SWAGGER_ENABLED=false`).
