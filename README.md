# Bitácora de Obra

Bitácora por elemento + punchlist sobre plano, con fotos y reportes. FORESPOT.

- **Frontend**: PWA instalable (React + Vite) — `web/`
- **Backend**: Cloudflare Worker + D1 (SQLite) + R2 (fotos y planos) — `worker/`, `migrations/`
- **Deploy**: push a `main` → GitHub Actions → `wrangler deploy` (crea D1/R2 si no existen, aplica migraciones)

## Secrets del repo (Settings → Secrets → Actions)
- `CLOUDFLARE_API_TOKEN` — permisos: Workers Scripts, D1, R2 (Edit)
- `CLOUDFLARE_ACCOUNT_ID`
- `RESEND_API_KEY` — opcional; sin ella no salen correos de acceso

## Primer acceso
El primer correo que pide código se convierte en administrador. Después, altas desde **Usuarios y accesos**.

## Desarrollo local
```
npm ci && npm --prefix web ci
sed 's/__D1_ID__/local/' wrangler.toml > wrangler.local.toml
npx wrangler d1 migrations apply bitacora-obra --local -c wrangler.local.toml
npm run build && npx wrangler dev --local -c wrangler.local.toml --var DEV:1
```
En modo `DEV=1` el código de acceso se muestra en pantalla.
