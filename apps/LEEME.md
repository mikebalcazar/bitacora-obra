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
