# Domera frontend

Next.js frontend for Domera.

## Local development

```bash
npm ci
npm run dev
```

The app runs at `http://localhost:3000` and expects the backend API at `http://localhost:4000/api` unless overridden in `.env`.

## Vercel deployment

Create the Vercel project with these settings:

- Root Directory: `domera2/frontendd`
- Framework Preset: `Next.js`
- Install Command: `npm ci`
- Build Command: `npm run build`

Set these environment variables in Vercel:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.example/api
API_BASE_URL=https://your-backend-domain.example/api
NEXT_PUBLIC_DEMO_COMPANY_ID=demo-company
NEXT_PUBLIC_DEMO_APARTMENT_ID=demo-apartment
```

`NEXT_PUBLIC_API_BASE_URL` is used by browser-side requests. `API_BASE_URL` is used by server-side rendering and rewrites.

The Nest backend in `../back-end` is not deployed by this Vercel project. Deploy it separately and use its public `/api` URL in the variables above.
