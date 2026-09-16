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

La excepción es `windows-nativo`, que no lleva el sitio adentro: tiene su propia
pantalla de entrada en C++ y llama a `/api/auth/pin` a mano. Ésa sí hay que
tocarla, y en `main.cpp` está anotado exactamente qué cambiar.
