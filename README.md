# Bitácora de Obra

Bitácora por elemento + punchlist sobre plano, con fotos y reportes. FORESPOT.

- **Frontend**: PWA instalable (React + Vite) — `web/`
- **Backend**: Cloudflare Worker + D1 (SQLite) + R2 (fotos y planos) — `worker/`, `migrations/`
- **Deploy**: push a `main` → GitHub Actions → `wrangler deploy` (crea D1/R2 si no existen, aplica migraciones)

## Las llaves (Settings → Secrets and variables → Actions)

Son **las mismas dos que ya usa el portal de Taller 101**. Los valores están en
el archivo `llaves.env` de la carpeta de aquel proyecto, en tu computadora: se
copian de ahí y se pegan aquí. GitHub no deja leer un secreto ya guardado —
ni desde el otro repositorio, ni desde aquí — así que el paso hay que darlo a mano
una sola vez.

| Secreto | De dónde sale | Si falta |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | El mismo de T101. Permisos: Workers Scripts:Edit, Workers R2 Storage:Edit, D1:Edit, Account Settings:Read, User Details:Read | No se publica nada |
| `RESEND_API_KEY` | La misma de T101 | Todo funciona menos los correos con el código de acceso |

**No se pide la cuenta de Cloudflare por separado:** el token ya dice a qué cuenta
pertenece. La base D1 y el almacén R2 se crean solos en el primer despliegue.

### Las dos plataformas viven separadas

Nada de aquí toca el portal de Taller 101. Cada una tiene lo suyo, con nombre
distinto, y borrar o mudar una no le hace nada a la otra:

| | Bitácora de Obra | Portal Taller 101 |
|---|---|---|
| Repositorio | `bitacora-obra` | `t101-portal-trabajadores` |
| Worker | `bitacora-obra` | `t101-portal` |
| Base D1 | `bitacora-obra` | `t101-trabajadores` |
| Archivos R2 | `bitacora-obra-files` | `t101-documentos` |
| Secretos | Los de este repositorio | Los de aquel repositorio |

Lo único que comparten es la **cuenta** de Cloudflare y la de Resend, porque son
tuyas. Si quieres que ni eso se toque, saca un token de Cloudflare aparte para
esta plataforma y pégalo aquí: el día que canceles uno, el otro sigue publicando.
Para dar de baja esta plataforma sin rozar la otra: borra el Worker
`bitacora-obra`, la base `bitacora-obra` y el bucket `bitacora-obra-files`.

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
