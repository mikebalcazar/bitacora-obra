# Piloto nativo de t101pano

Esto no es un envoltorio: no hay navegador. La ventana es de Windows, el plano lo
dibuja PDFium —las mismas entrañas que usa Chrome para ver PDFs, sueltas— y los
pines los pinta el propio programa.

Sirve para contestar una pregunta y nada más: **¿se siente mejor el plano en
nativo, con el mismo plano y la misma máquina?** Si la respuesta es que no, no
hay nada que discutir sobre mantener dos aplicaciones.

## Qué hace

- Entrar con correo y PIN, contra el mismo servidor.
- Bajar la primera obra que tenga plano en PDF.
- Dibujarlo, moverlo con el ratón y acercarlo con la rueda.
- Pintar los pines: el aro dice cómo va el punchlist, el hueco dice que sigue en
  producción.

## Qué NO hace

Todo lo demás. No se registra nada, no se levantan pendientes, no se suben fotos,
no se eligen obras ni planos —toma el primero que encuentra—, no funciona sin
señal. Es un piloto: mide, no trabaja.

## El medidor

Arriba a la izquierda, siempre a la vista, porque es el motivo del ejercicio:

| Número | Qué dice |
|---|---|
| Dibujado | Milisegundos que cuesta pintar un cuadro del plano, y a cuántos por segundo equivale |
| Memoria | Lo que el proceso tiene tomado del sistema |
| Plano en pantalla | Desde que se dio Enter hasta que el plano se vio |

Para comparar contra la web con honestidad: mismo plano, misma máquina, mismo
zoom. En el navegador, esos números se leen en las herramientas de desarrollo
(pestaña Rendimiento y el administrador de tareas del navegador).

## Lo que ya se sabe sin medir

Mantener esto significa escribir dos veces cada cosa nueva, en dos lenguajes, y
que un arreglo hecho en una no exista en la otra hasta que alguien lo repita. El
piloto no responde eso: responde si vale la pena pagarlo.
