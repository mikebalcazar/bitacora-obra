# quell101

Bitácora por ítem + punchlist sobre plano, con fotos y reportes. FORESPOT.

El nombre que se ve —en la pantalla, en la app instalada, en los correos— es
**quell101**, en minúsculas. Por dentro, el repositorio, el Worker, la base y el
almacén siguen llamándose `bitacora-obra`: son direcciones, no rótulos, y
cambiarlas crearía recursos nuevos y vacíos, con la obra guardada en los viejos.

- **Frontend**: PWA instalable (React + Vite) — `web/`
- **Backend**: desde el 19-sep-2026 los datos viven en la **base por empresa de la suite** (`suite101-api`, migración 0006, motor en `src/quell/`). El Worker de aquí (`worker/`) es el cascarón: sirve la pantalla y reenvía `/api/*` y `/files/*` a la suite. El bucket R2 se queda sólo para los instaladores.
- **Deploy**: push a `main` → GitHub Actions → staging (`bitacora-obra-staging`, contra la API de staging y la empresa demo, con humo de punta a punta) → producción

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

Los correos salen desde `bitacora@envios.taller101.mx`, el dominio que ya está
verificado en Resend para el portal de Taller 101. Es lo único que hace falta
compartir para que el código de acceso le llegue a cualquiera; con el remitente
de prueba de Resend solo llegaba a tu propio correo.

**No se pide la cuenta de Cloudflare por separado:** el token ya dice a qué cuenta
pertenece. El almacén R2 (instaladores) se crea solo en el primer despliegue.
Los datos viven en la base por empresa de la suite, que es de `suite101-api`.

### Las dos plataformas viven separadas

Nada de aquí toca el portal de Taller 101. Cada una tiene lo suyo, con nombre
distinto, y borrar o mudar una no le hace nada a la otra:

| | Bitácora de Obra | Portal Taller 101 |
|---|---|---|
| Repositorio | `bitacora-obra` | `t101-portal-trabajadores` |
| Worker | `bitacora-obra` | `t101-portal` |
| Datos | la base por empresa de la suite (`quell_*`) | `t101-trabajadores` (D1) |
| Archivos R2 | `suite101` (planos y fotos, bajo `orgs/{empresa}/quell/`) · `bitacora-obra-files` (instaladores) | `t101-documentos` |
| Secretos | Los de este repositorio | Los de aquel repositorio |

Lo único que comparten es la **cuenta** de Cloudflare y la de Resend, porque son
tuyas. Si quieres que ni eso se toque, saca un token de Cloudflare aparte para
esta plataforma y pégalo aquí: el día que canceles uno, el otro sigue publicando.
Para dar de baja esta plataforma sin rozar la otra: borra el Worker
`bitacora-obra` y el bucket `bitacora-obra-files`. Los datos de cada empresa se
quedan en su base de la suite (apagar la app no los borra). La base D1 vieja
`bitacora-obra` quedó en Cloudflare como red de seguridad de la mudanza del
19-sep-2026; se borra cuando lleve unos días de más.

## Cómo se entra
La puerta es la de la **suite 101**, la misma que dash101, peek101 y las demás:
correo y código de 6 dígitos, o el PIN de la suite, o la cuenta de Google. El
sitio le habla a `suite101-api` desde su propio origen, por `/s101/*`, con un
*service binding*; el Worker pone `X-App: quell101`.

Entrar a la suite no basta: hay que estar dado de alta en las dos partes.

| Dónde | Quién lo hace | Qué decide |
|---|---|---|
| **workshop101** | Quien administra la empresa | Que la persona exista en la suite y que quell101 esté en su lista de apps |
| **Usuarios y accesos**, aquí | El dueño de la bitácora | Qué es en obra —dueño, supervisor o contratista— y en qué obras |

Las dos se casan por el correo. Quien entra a la suite y no tiene renglón aquí
ve una pantalla que se lo dice; no se le inventa un rol.

El APK de Android y la app de Windows **ya instaladas** siguen entrando por la
puerta anterior (correo + PIN guardado en esta base) hasta que se rearmen: llevan
adentro la copia anterior del sitio. Al rearmarlas piden la sesión a la suite con
`aparato: true` y se quedan con el token, que es lo que el contrato 0.8.0 abrió
para ellas.

## Desarrollo local
```
npm ci && npm --prefix web ci
npm run prueba          # la puerta del cascarón, el build y la pantalla de entrada
npm run humo            # de punta a punta contra staging (bitacora-obra-staging)
```
El motor y sus pruebas viven en `suite101-api` (`src/quell/`, `pruebas/quell.spec.ts`).
