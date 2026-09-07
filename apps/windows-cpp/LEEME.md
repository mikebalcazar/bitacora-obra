# quell101 nativo para Windows

La misma aplicación, en una ventana de Windows escrita en C++ que usa el WebView
del sistema —el motor de Edge, que ya viene instalado— en vez de traer su propio
navegador adentro.

|  | Electron | Nativo (C++) |
|---|---|---|
| Tamaño | ~82 MB | ~3 MB |
| Navegador | Uno propio, incluido | El del sistema |
| Arranque | Levanta su navegador | Casi inmediato |
| Memoria | Dos motores en RAM | Uno, el que Windows ya tenía |
| Requisito | Ninguno | WebView2 (viene con Windows 11; en Windows 10 llega con Edge) |

## Un solo archivo

La aplicación web va incrustada dentro del ejecutable, no en una carpeta al lado.
Se copia a una USB y funciona. El programa se sirve sus propios archivos desde
memoria, bajo el nombre `https://app.t101pano`, que no existe en internet: lo
atiende él mismo. Ese nombre hace falta porque una página sin origen —abierta
como archivo suelto— no puede guardar nada ni hablar con el servidor.

## Lo que esto NO es

No es la aplicación reescrita en C++. La interfaz —el plano, las fotos, los
pendientes— sigue siendo la misma web, y se sigue manteniendo en un solo lugar.
Lo que cambió es el envoltorio.

Reescribir la interfaz de verdad en C++ significaría dibujar el plano, leer el
PDF, manejar la base local y la sincronización otra vez, en otro lenguaje, y
mantener dos aplicaciones distintas para siempre. Eso es otro proyecto, no una
versión de este.

## Armarlo

Sale de GitHub → Actions → **Armar apps**, junto a las otras dos. Necesita el
compilador de Visual Studio y los encabezados de WebView2, que el propio flujo
descarga.
