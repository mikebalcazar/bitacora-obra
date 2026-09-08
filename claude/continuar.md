# quell101 — para seguir en otro chat

Léelo completo antes de tocar nada. Aquí está lo que otro chat tardó varios
días en aprender. Después de esto, la fuente de verdad es el propio
repositorio: los mensajes de commit dicen qué se hizo y por qué, y el código
dice cómo. Este chat no dejó bitácora aparte: cada PR mergeado es un renglón.

## Qué es esto

**quell101** es la bitácora de obra por ítem y el punchlist sobre plano de
**taller101** (Mike, `mike@forespot.com`). Se sube el plano (PDF o imagen),
se le ponen pines —los ítems: muebles, puertas, acabados—, cada ítem lleva su
proceso (compras → fabricación → flete → instalación → entrega), su muro de
notas con fotos y, una vez entregado, su punchlist. Se usa en obra, en el
celular, con mala señal.

Es una de la familia **101**: taller101 es la empresa y la marca madre;
draw101, nest101, roster101 y quell101 son las plataformas. **suite101** es el
proyecto que las va a conectar; Mike está escribiendo el documento de
arquitectura y hasta que exista **no se conecta nada entre plataformas**.

Regla fundacional, de la primera hora del chat: *"necesito que vivan
separadas las plataformas por si un día una hay que borrarla o migrarla"*.
quell101 y roster101 comparten dueño y llaves de despliegue, y nada más:
ni base, ni bucket, ni Worker, ni código.

## Dónde está todo

| | |
|---|---|
| Repositorio | https://github.com/mikebalcazar/bitacora-obra (privado) |
| Rama que publica | `main` — cada push despliega solo, con GitHub Actions |
| Sitio y API | https://bitacora-obra.mike-929.workers.dev |
| Descargas de las apps | `/descargas/android.apk`, `/descargas/windows.exe` (ligas en la pantalla de entrada) |
| Worker / D1 / R2 | `bitacora-obra` / `bitacora-obra` / `bitacora-obra-files` — **no se renombran** |
| Estado al cerrar este chat | `Publicar bitácora` run #34 verde · `Armar apps` run #10 verde · 9 migraciones aplicadas |

Los nombres de infraestructura son los del proyecto original ("bitácora de
obra") y así se quedan aunque la aplicación se llame quell101: renombrarlos
cambia la dirección y desliga la base. Lo mismo `'https://app.t101pano'` en
la lista de orígenes del Worker: es la dirección interna de la app de Windows
ya instalada y cambiarla dejaría fuera a quien la tenga.

Estructura del repositorio:

```
worker/index.js     todo el servidor: API, sesiones, PIN, roles, archivos en R2, correos (Resend)
migrations/         0001 base · 0002 asignación de pendientes · 0003 PIN · 0004 idempotencia
                    0005 fases · 0006 etapas · 0007 fabricación · 0008 rol por obra + dudas · 0009 fotos en dudas
web/src/
   App.jsx          rutas por hash, contexto (user, go, toast), fila de subida
   Login.jsx        correo + PIN de 6 dígitos; la primera vez, código al correo y ahí se pone el PIN
   Home.jsx         las obras
   Project.jsx      la obra: plano, lista, dudas, barra lateral, hoja de planos, reporte
   PlanCanvas.jsx   el plano: un solo canvas del tamaño de la pantalla, pan/zoom, pines
   ElementPanel.jsx el ítem: bitácora, punchlist, barra del proceso al pie
   Dudas.jsx        las dudas de la obra (buzón / fila de trabajo)
   Fotos.jsx        ver, elegir, tira de pendientes, visor — las mismas en todo
   Admin.jsx        usuarios y quién entra a cada obra con qué rol
   Marca.jsx        el logotipo, en trazos (generado; no se edita a mano)
   api.js           llamadas, catálogos (TIPOS, FASES, ROLES, ROLES_OBRA), avance(), aguado()
   local.js         IndexedDB: caché de lecturas y fila de escrituras
   report.js        el PDF de reporte, armado en el cliente
web/public/         icon.svg, icon-*.png, icon-maskable-512.png, logo.svg, manifest, sw.js
apps/android/res/   íconos de Android (Capacitor rehace el proyecto en cada corrida; CI los copia)
apps/windows/       Electron + NSIS. build/icon.ico
apps/windows-cpp/   envoltorio WebView2 en C++      ┐ CONGELADOS: "deja ya la versión C++
apps/windows-nativo/ piloto PDFium + Win32 en C++    ┘  al menos que yo explícitamente te lo pida"
.github/workflows/
   deploy.yml       cada push a main: crea D1/R2 si no existen, migraciones, deploy, secretos, salud
   apps.yml         workflow_dispatch: android · windows · windows-nativo · windows-piloto → R2
Logo taller101 - NEW.svg   el logotipo original de taller101, fuente de verdad de la geometría
```

## Reglas que puso Mike

1. **Las plataformas viven separadas.** Ver arriba. No compartir base ni código.
2. **Las llaves viven en GitHub Actions y en ningún otro lado.** Son las mismas
   dos de T101: `CLOUDFLARE_API_TOKEN` y `RESEND_API_KEY`. Nunca se leyeron
   ni se escribieron en un chat; se comprobó que sirven viendo el deploy en
   verde. `MAIL_FROM` va con el dominio verificado `envios.taller101.mx`.
3. **quell101 en minúsculas, siempre.** taller101 igual.
4. **El logotipo va siempre en el azul oficial `#0381c2` sobre blanco, o en
   blanco sobre ese azul.** Nunca en negro. La única excepción es el ícono
   de la aplicación.
5. **El logotipo sigue al de taller101 pieza por pieza**: Sansation Bold,
   misma altura de letra, apretón de −0.05 em entre letras, mismo aro, mismo
   subrayado. La palabra va en trazos, no en texto: sin la fuente instalada
   cada quien vería otro logotipo.
6. **Nada de C++** salvo que Mike lo pida con esas palabras. Los dos
   proyectos siguen compilando en `apps.yml`; no se tocan.
7. **La web en pantalla de escritorio y la app de Windows son la misma
   pantalla** y se ven igual.
8. Un cambio = PR a `main` → merge → leer el run → decirle a Mike qué se midió
   y qué no se pudo verificar. Los commits van en español, en el tono de
   este documento, y dicen cómo se probó. Sin identificadores de modelo.

## Cómo está armado (lo que hay que saber para no romperlo)

**Roles.** Tres de cuenta: `admin` (dueño), `int` (supervisor), `con`. Y uno
por obra en `project_members.rol`: `con` (contratista: ve nada más los
pendientes con su nombre) o `tra` (trabajador: ve la obra completa, no edita
nada, levanta dudas). En el código son dos preguntas distintas: `staff`
(escribe) y `veTodo` (ve). No fundirlas otra vez.

**Etapas.** Viven en la tabla `etapas` (clave, nombre, orden,
`abre_punchlist`, activa): agregar una es un INSERT, no un deploy. Palomear
una da por cumplidas las anteriores; despalomear tira las siguientes. Meter
una etapa en medio obliga a rellenar (ver `0007`). La fase del ítem
(`produccion` / `punchlist`) se deriva de la etapa que abre el punchlist; el
endpoint viejo `/fase` sigue existiendo y entra por el mismo camino.

**Sin señal.** Toda lectura se guarda en IndexedDB y toda escritura entra a
una fila con un `op_id` hecho en el dispositivo; el servidor lo apunta en
`operaciones` y no repite. Al abrir la obra se bajan los planos a la caché.

**PIN.** PBKDF2 con **100000 vueltas: Cloudflare no ejecuta más** y responde
con error. Castigos crecientes por usuario y por IP.

**Pines del plano.** Sin número adentro (con un dígito el grid los estiraba
a 120 px). Relleno = tipo; aro rojo = punchlist sin cerrar; en producción el
relleno va al 50% (`aguado`). Solo los pines llevan CSS transform; el plano
es un canvas del tamaño de la pantalla que se repinta por trozos (así se
acabó el crash de iPhone al hacer zoom).

**Migraciones con `CHECK`.** SQLite no altera un CHECK: hay que rehacer la
tabla. Con `users` **no se puede** (media base le apunta y falla con llaves
foráneas activas: se probó); por eso el rol por obra es una columna nueva.
Con `photos` **sí se pudo** porque nadie la referencia. Siempre probar la
migración en `sqlite3` en memoria con `PRAGMA foreign_keys = ON` y datos.

## Cómo se verifica un cambio (no se asume: se mide)

No hay servidor local: el Worker no corre en el chat (no se instaló wrangler
dev aquí). Lo que se usó, y funciona:

- **La aplicación de verdad con la red simulada.** Un `web/pruebas.html` que
  carga `src/pruebas.jsx`: sobreescribe `window.fetch` con respuestas de
  mentiras para `/api/me`, `/api/projects`, `/api/projects/:id`,
  `/api/elements/:id`, `/api/projects/:id/dudas`, pone el hash en `#/p/p1` e
  importa `./main.jsx`. Se sirve con `npx vite --port 5199 --strictPort`
  dentro de `web/` y se maneja con Playwright (`npm i --no-save playwright@1`
  en `web/`, Chromium en `/opt/pw-browsers/chromium`). Así se encontraron el
  interruptor tapando el embudo y la lista que no scrolleaba en 390 px.
  **Los archivos de prueba se borran antes del commit**, junto con
  `playwright` de `node_modules`.
- Se mide en 390×844 y en 1440. Cero errores de página. Se cuentan elementos
  (`locator().count()`), no se mira nada más la captura.
- Las migraciones, en `sqlite3` en memoria con todas las anteriores aplicadas,
  llaves activas y datos: filas antes/después, `PRAGMA foreign_key_check`.
- Los íconos se renderizan a 512 y a 32 (`cairosvg` + PIL) y se mide el aro:
  una máscara SVG se veía bien a 512 y a 32 quedaba al 42%; por eso el hueco
  del aro del ícono es un arco calculado, no una máscara.
- El despliegue se lee en el run de Actions: paso "Revisar que la bitácora
  responda". Las apps, en `Armar apps` (se dispara con `actions_run_trigger`,
  input `servidor`).

Gotchas de este entorno:
- `pkill -f "<patrón>"` mata la propia shell si el patrón aparece en su línea
  de comando. Nada corre después. Usar un patrón que no esté en el comando.
- `{x.abre_punchlist && <span/>}` pinta un `0` cuando viene `0` de SQLite.
  Siempre `!!`.
- `.stage{touch-action:none}` (para panear el plano) apaga el scroll de
  cualquier cosa que viva dentro: la lista y las dudas llevan `touch-action:pan-y`.
- `.gitignore` tenía `android` sin anclar y tapaba `apps/android`. Ya es `/android`.
- El service worker es network-first para el sitio; aun así Mike refresca
  fuerte para ver cambios, y el ícono de Windows exige desinstalar el anterior.
- `SendUserFile` rechaza archivos grandes; las capturas van a 2× y recortadas.

## Lo que el chat en la nube NO alcanza, y lo que sí

**No alcanza** (política de egreso; no se rodea, se reporta):
- `*.workers.dev` y `api.cloudflare.com` → el proxy rechaza el CONNECT. No se
  puede curlear producción ni publicar desde el chat.
- Los secretos de Actions: no se leen ni se listan. Se prueban por el deploy.
- Google Fonts, cdnjs, jsDelivr y casi todo lo demás.

**Sí alcanza:**
- **GitHub** completo con `mcp__github__*`: crear y mergear PRs, leer runs y
  logs, **disparar workflows**. Por ahí se hace todo lo de Cloudflare.
- **npm** (`registry.npmjs.org`) y **PyPI**. Así llegó Sansation
  (`@fontsource/sansation`), Playwright, `numpy`, `cairosvg`, `fonttools`.

## Credenciales, accesos y permisos: qué se lleva el chat nuevo

Nada que copiar, porque nada vive en el chat:

- **Publicar** no necesita ninguna máquina prendida: cada merge a `main`
  despliega desde GitHub Actions con los secretos del repositorio
  (`CLOUDFLARE_API_TOKEN`, `RESEND_API_KEY`). Están puestos y funcionan.
- **Las apps** se arman igual, en Actions, y se publican solas en R2.
- **La base y los archivos** viven en Cloudflare, bajo la cuenta de Mike.
- **Lo único que el chat nuevo necesita** es tener conectado el repositorio
  `mikebalcazar/bitacora-obra` (y `t101-portal-trabajadores` si va a tocar
  roster101). Eso se hace al crear el chat dentro del proyecto suite101, o
  con `add_repo`. Con eso ya puede hacer todo lo que hizo este.
- **Lo que no tiene ningún chat**, ni este ni el que sigue: acceso directo a
  producción y a los secretos. Eso es a propósito.

## Estado de cada cosa al cerrar este chat

**Hecho, mergeado y publicado (PRs #1–#33):**
- Plano: PDF nítido encima de la imagen, dibujado por trozos; sin crash de
  iPhone; pan, pinch, botones de zoom, ajustar.
- Ítems: tipos Mueble / Puerta / Acabado con color y filtro por tipo; código,
  nombre, responsable; saltar de uno a otro sin volver al plano.
- Proceso: compras → fabricación → flete → instalación → entrega, en una barra
  al pie del panel del ítem; entrega abre el punchlist. Lista general de la
  obra con embudo por etapa y avance por ítem (Plano · Lista · Dudas).
- Bitácora por ítem (muro con fotos, sin clasificación) y punchlist con
  asignación, evidencia del contratista, cierre del supervisor, vencidos.
- Roles: dueño / supervisor / contratista, y por obra contratista o
  trabajador. Invitación por correo al agregar a alguien a una obra.
- Dudas: buzón para quien pregunta, fila para quien contesta, con fotos en
  pregunta y respuesta, ligadas a un ítem si aplica.
- Acceso con correo + PIN; primera vez con código al correo. Sin señal:
  lectura de caché y fila de escritura con idempotencia.
- Apps: Android (APK, sin Play Store) y Windows (instalador NSIS), con
  descarga desde la pantalla de entrada. Íconos propios.
- Marca: logotipo quell101 medido del de taller101; ícono aro + Q.
- Varios planos por obra, alcanzables desde el celular.

**Mike no ha probado todavía (yo no puedo: no llego a producción):**
1. El PIN de punta a punta con un contratista de verdad.
2. La fila sin señal, en modo avión, con fotos.
3. Las apps de Android y Windows corriendo en aparatos de verdad.
4. El rol trabajador y las dudas con fotos, desde el teléfono.
5. Que el correo de invitación llegue (sale por Resend con `MAIL_FROM`).

**Mike tiene que hacer / decidir:**
1. Compartir el **documento de arquitectura de suite101**. Hasta entonces, la
   asociación con roster101 no se construye.
2. Decir si el aro **verde** de "todo resuelto" en el plano vuelve (se quitó
   a petición suya; solo queda el rojo de "sin cerrar").

**Ideas que quedaron en el aire (Mike no las pidió; no hacerlas sin preguntar):**
- Al agregar a un trabajador en quell101, **asociarlo en roster101**: si no
  existe, crearlo; si existe, pedirle que genere su PIN. Mike dijo "hay que
  ver". roster101 hoy no expone API externa y tiene un Worker por empresa;
  la conexión depende del documento de arquitectura.
- Avisar por correo al supervisor cuando llega una duda nueva.
- Botón para volver a mandar el correo de invitación.
- Catálogo de etapas por obra (hoy es global).
- El `theme_color` del manifiesto es el de `index.html`; nadie ha decidido
  el color de la barra del sistema.

## Cómo arrancar el chat nuevo

0. **Leer `OPERAR.md`**, en la raíz. Ahí está cómo se recupera el token, cómo
   se abre y se mergea un PR, y cómo se verifica producción sin la computadora
   de Mike. Va igual en los seis repositorios de la suite. Si un chat te está
   pidiendo que abras GitHub o que le digas si el sitio quedó bien, no lo leyó.
1. Crear el chat dentro del proyecto **suite101** con el repositorio
   `mikebalcazar/bitacora-obra` conectado, y pedir: *"lee
   `claude/continuar.md`"*.
2. Antes de cualquier cambio: `git log --oneline -5` y el último run de
   `deploy.yml`. Si no está verde, eso va primero.
3. Un cambio = levantar la aplicación con la red simulada y medirlo →
   commit en español → PR → merge a `main` → leer el run → contarle a Mike qué
   se midió, con números, y qué no se pudo verificar.
4. Si toca la marca: la geometría sale de `Logo taller101 - NEW.svg` y de
   Sansation Bold vía npm; se reconstruye "taller" primero y se comprueba que
   cae a 0.00 antes de dibujar nada nuevo.
