# Deploying Domera on Vercel

Deploy the frontend as a Vercel Next.js project.

## Project settings

- Root Directory: `frontendd`
- Framework Preset: `Next.js`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `.next`

The frontend folder includes its own `vercel.json` for this setup. Setting the
Root Directory is important: the repository-level `package.json` is only a
development wrapper and does not declare Next.js. If Vercel uses the repository
root, framework detection fails with `No Next.js version detected`.

## Environment variables

Add these variables in Vercel for Production, Preview, and Development:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.example/api
API_BASE_URL=https://your-backend-domain.example/api
NEXT_PUBLIC_DEMO_COMPANY_ID=demo-company
NEXT_PUBLIC_DEMO_APARTMENT_ID=demo-apartment
```

Use the real deployed backend URL instead of `https://your-backend-domain.example/api`.

## Backend note

The `back-end` app is a Nest server and should be deployed separately. After deployment, configure its CORS/session settings to allow the Vercel frontend domain:

```bash
FRONTEND_URL=https://your-vercel-project.vercel.app
APP_URL=https://your-vercel-project.vercel.app
CORS_ALLOWED_ORIGINS=https://your-vercel-project.vercel.app
TRUST_PROXY_HEADERS=true
```
