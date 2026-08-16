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

### Extension (from the website)

1. Open **https://web-autopsy.vercel.app/extension**
2. Click **Download & install**, unzip, then Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
3. Sign up → **Settings** → create an API token
4. Extension **Options** → API base URL is prefilled; paste the token
5. Browse a site → open the inspector → **Save**

### Extension (local build)

1. `pnpm package:extension` (or `pnpm --filter extension build`)
2. Chrome → Load unpacked → `apps/extension/.output/chrome-mv3`
3. Same token flow as above

Unsaved browsing never leaves the browser. Secrets are redacted by default.
