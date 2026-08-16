# Web Autopsy

Chrome extension + Next.js team archive for website health. Capture stays local until you click **Save**. Production site deploys from GitHub → Vercel.

## Monorepo

- `apps/extension` — WXT Manifest V3 extension
- `apps/web` — Next.js archive (Vercel + Neon)
- `packages/core` — shared types, findings, portable-API classifier, codegen

## Local development

```bash
pnpm install
pnpm --filter @web-autopsy/core build
cp apps/web/.env.example apps/web/.env   # fill DATABASE_URL, auth secrets
pnpm --filter web db:push
pnpm --filter web dev
pnpm --filter extension dev
```

Load the unpacked extension from `apps/extension/.output/chrome-mv3`.

1. Sign up on the web app
2. Settings → Create extension token
3. Extension Options → paste base URL + token
4. Browse a site → open inspector → **Save**

## Scripts

- `pnpm test` — core unit tests
- `pnpm typecheck`
- `pnpm build`

## Deploy

1. Push to GitHub (`main`)
2. Import repo in Vercel with root `apps/web` (or use `apps/web/vercel.json` install/build)
3. Set env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, optional `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, AI Gateway
4. Point the extension `API_BASE_URL` at the production URL

Unsaved browsing never leaves the browser. Secrets are redacted by default.
