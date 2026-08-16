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

## Production

**https://web-autopsy.vercel.app**

Also available at `https://web-autopsy-abusayem.vercel.app`.

### Extension (unpacked)

1. `pnpm --filter extension build`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `apps/extension/.output/chrome-mv3`
3. Sign up on the production site → **Settings** → create an extension API token
4. Extension **Options** → API base URL `https://web-autopsy.vercel.app` + paste the token
5. Browse a site → open the inspector → **Save** (unsaved captures stay local)

### Teammates

Invite from **Team** on the web app (owner/member/viewer). Viewers get Story view; Technical toggle for engineers.

### Deploy

1. Push to GitHub (`main`) — Vercel auto-deploys
2. Env on Vercel: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` (optional Google OAuth + AI Gateway)

Unsaved browsing never leaves the browser. Secrets are redacted by default.
