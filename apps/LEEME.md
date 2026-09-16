# Las apps de quell101 para Android y Windows

Son la misma aplicación de siempre, empaquetada. No hay un segundo código que
mantener: las dos llevan adentro lo que sale de `npm run build`, y hablan con el
mismo servidor de Cloudflare.

|  | Android | Windows |
|---|---|---|
| Envoltorio | Capacitor | Electron |
| Qué sale | `.apk` | instalador `.exe` |
| Se arma en | GitHub Actions (`Armar apps`) | GitHub Actions (`Armar apps`) |

## Por qué empaquetadas y no un acceso directo al sitio

Porque el sitio va **adentro**. Abrir la app sin señal muestra la aplicación
completa, no la pantalla de "sin conexión" del navegador. Lo que se registre en
obra se guarda en el dispositivo y sube solo cuando vuelve la señal, igual que en
la web, pero sin depender de que el navegador haya guardado bien su copia.

## La dirección del servidor

Al empaquetar se fija con `VITE_API_BASE`. Es lo único que cambia respecto de la
versión web, donde las rutas son relativas.

Como la app y el servidor ya no comparten origen, la sesión viaja como token en
vez de cookie, y el servidor nombra uno por uno los orígenes que acepta
(`worker/index.js`, lista `ORIGENES`).

## Armarlas

En GitHub → pestaña Actions → **Armar apps** → *Run workflow*. Al terminar, los
archivos quedan colgados de esa corrida, en Artifacts.

El `.apk` que sale es de depuración: se instala en cualquier teléfono con
"orígenes desconocidos" permitido, pero no sirve para la Play Store. Para la
tienda hace falta una llave de firma, y esa se guarda como secreto del
repositorio el día que se vaya a publicar.

## Las que están instaladas hoy NO entran (16-sep-2026)

Mike mandó cerrar la puerta vieja de la bitácora, y con eso el `.apk` y el
instalador de Windows que ya andan por ahí dejaron de poder entrar: llevan
adentro la copia del sitio de **antes** de la mudanza al login de la suite, y
ésa pedía la sesión a `/api/auth/*`, que hoy contesta 410.

No es un descuido: se pidió así, y mientras tanto se entra por el navegador.

**Rearmarlas no necesita escribir código.** Lo que va dentro del `.apk` y del
instalador sale de `npm run build`, y ese código ya entra por la suite —incluido
el camino de app empacada: `web/src/suite.js` pide la sesión con
`aparato: true`, la suite devuelve el token y se guarda en el mismo llavero
(`bo_token`) que `api.js` ya manda en `Authorization`—. O sea: basta con correr
**Armar apps** otra vez y repartir lo que salga.

La excepción es el **piloto nativo** (`apps/windows-nativo/`, el trabajo
`windows-piloto` del flujo), que no lleva el sitio adentro: tiene su propia
pantalla de entrada en C++ y llama a `/api/auth/pin` a mano. Ése sí hay que
tocarlo, y en su `main.cpp` está anotado exactamente qué cambiar. El flujo se
niega a armarlo mientras siga así, para no dejar en la página de descargas un
programa que no abre.

Ojo con los nombres, que confunden: el trabajo `windows-nativo` del flujo
compila `apps/windows-cpp/`, que **sí** lleva el sitio adentro —es una ventana
de Windows con el WebView— y por lo tanto entra por la suite como las demás. El
piloto es el otro, el de `apps/windows-nativo/`, y no es una app de trabajo: se
hizo para medir si el plano se siente mejor dibujado en nativo.

## Armarlas de una en una

El flujo pregunta **cuál**: `android`, `windows`, `windows-nativo`, `piloto` o
`todas`. Antes armaba y publicaba las cuatro de un jalón, y eso dejó de servir
el día que una de ellas no podía entrar: publicar las cuatro habría puesto en
descargas un programa roto junto a tres buenos.
