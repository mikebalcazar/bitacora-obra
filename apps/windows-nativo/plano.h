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

// Rasterizar un plano de obra cuesta cientos de milisegundos: son miles de
// líneas. Hacerlo en cada cuadro mientras alguien arrastra el plano da dos
// cuadros por segundo, que es lo que se siente como una aplicación rota.
//
// Así que se dibuja UNA vez y se guarda. Mientras la mano se mueve, lo guardado
// se corre y se estira —copiar píxeles es instantáneo—, y al soltar se redibuja
// nítido. Es lo mismo que hace la versión web, y por eso allá se siente fluida.
struct Dibujo {
    int ancho = 0, alto = 0;
    std::vector<unsigned char> pixeles;   // BGRA
    double ms = 0;                        // lo que costó el último rasterizado
    double desplazaX = 0, desplazaY = 0, escala = 1;   // con qué vista se dibujó
    bool vale = false;
};

// Rasteriza con la vista dada y guarda el resultado. Lento a propósito: se llama
// cuando la vista se queda quieta.
const Dibujo& rasteriza(int anchoVentana, int altoVentana, double desplazaX, double desplazaY, double escala);

// Lo último que se rasterizó, para estirarlo mientras se mueve.
const Dibujo& guardado();

}  // namespace plano
