#pragma once
// El plano: abrir el PDF y dibujar, a la escala que se esté viendo, solo el
// pedazo que cabe en la pantalla. Es la misma idea que en la web —nunca una
// imagen gigante— pero aquí el dibujado lo hace PDFium directo a memoria.
#include <windows.h>
#include <vector>
#include <string>

namespace plano {

bool abre(const std::vector<unsigned char>& pdf);
void cierra();
bool abierto();

// Medidas de la página en puntos, tal como vienen del PDF.
double ancho();
double alto();

// Dibuja el pedazo visible. Devuelve los píxeles en BGRA, listos para pintarlos.
// desplazaX/Y y escala son la vista: los mismos tres números que mueve el dedo.
struct Dibujo {
    int ancho = 0, alto = 0;
    std::vector<unsigned char> pixeles;   // BGRA
    double ms = 0;                        // cuánto costó, que es lo que se vino a medir
};
Dibujo dibuja(int anchoVentana, int altoVentana, double desplazaX, double desplazaY, double escala);

}  // namespace plano
