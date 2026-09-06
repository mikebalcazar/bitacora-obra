#include "plano.h"
#include "fpdfview.h"
#include <chrono>

namespace plano {

static FPDF_DOCUMENT g_doc = nullptr;
static FPDF_PAGE g_pagina = nullptr;
static std::vector<unsigned char> g_datos;   // PDFium no copia: los bytes tienen que seguir vivos
static bool g_iniciado = false;
static Dibujo g_guardado;

bool abre(const std::vector<unsigned char>& pdf) {
    cierra();
    if (!g_iniciado) {
        FPDF_LIBRARY_CONFIG cfg{};
        cfg.version = 2;
        FPDF_InitLibraryWithConfig(&cfg);
        g_iniciado = true;
    }
    g_datos = pdf;
    g_doc = FPDF_LoadMemDocument(g_datos.data(), (int)g_datos.size(), nullptr);
    if (!g_doc) return false;
    if (FPDF_GetPageCount(g_doc) < 1) { cierra(); return false; }
    g_pagina = FPDF_LoadPage(g_doc, 0);
    return g_pagina != nullptr;
}

void cierra() {
    g_guardado = Dibujo{};
    if (g_pagina) { FPDF_ClosePage(g_pagina); g_pagina = nullptr; }
    if (g_doc) { FPDF_CloseDocument(g_doc); g_doc = nullptr; }
    g_datos.clear();
}

bool abierto() { return g_pagina != nullptr; }
double ancho() { return g_pagina ? FPDF_GetPageWidth(g_pagina) : 0; }
double alto() { return g_pagina ? FPDF_GetPageHeight(g_pagina) : 0; }

const Dibujo& guardado() { return g_guardado; }

const Dibujo& rasteriza(int anchoVentana, int altoVentana, double desplazaX, double desplazaY, double escala) {
    Dibujo d;
    if (!g_pagina || anchoVentana <= 0 || altoVentana <= 0) { g_guardado = d; return g_guardado; }

    auto t0 = std::chrono::steady_clock::now();

    d.ancho = anchoVentana;
    d.alto = altoVentana;
    d.pixeles.assign((size_t)anchoVentana * altoVentana * 4, 0xFF);

    FPDF_BITMAP bmp = FPDFBitmap_CreateEx(anchoVentana, altoVentana, FPDFBitmap_BGRA,
                                          d.pixeles.data(), anchoVentana * 4);
    if (!bmp) { d.pixeles.clear(); d.ancho = d.alto = 0; g_guardado = d; return g_guardado; }
    FPDFBitmap_FillRect(bmp, 0, 0, anchoVentana, altoVentana, 0xFFFFFFFF);

    // La página entera se dibuja a la escala pedida, corrida a donde toque; lo
    // que cae fuera del lienzo PDFium lo recorta solo. El lienzo mide lo que la
    // ventana, así que acercarse no cuesta más memoria.
    int w = (int)(ancho() * escala);
    int h = (int)(alto() * escala);
    FPDF_RenderPageBitmap(bmp, g_pagina, (int)desplazaX, (int)desplazaY, w, h, 0, FPDF_ANNOT | FPDF_LCD_TEXT);
    FPDFBitmap_Destroy(bmp);

    d.ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    d.desplazaX = desplazaX;
    d.desplazaY = desplazaY;
    d.escala = escala;
    d.vale = true;
    g_guardado = std::move(d);
    return g_guardado;
}

}  // namespace plano
