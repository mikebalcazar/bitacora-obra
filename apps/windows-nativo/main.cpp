// t101pano nativo — prueba piloto.
//
// La misma obra, dibujada por Windows en vez de por un navegador: el plano lo
// pinta PDFium directo a memoria y los pines se dibujan encima con GDI. No es la
// aplicación completa: se entra, se elige obra y plano, se mueve y se acerca, y
// se ven los pines. Solo lectura.
//
// Lo que se vino a medir está en pantalla, arriba a la izquierda: milisegundos
// que cuesta cada dibujado, memoria del proceso y cuánto tardó en aparecer el
// plano desde que se pidió. Son los mismos números que se pueden mirar en la
// versión web para compararlos con el mismo plano y la misma máquina.

#define WINVER 0x0A00
#define _WIN32_WINNT 0x0A00

#include <windows.h>
#include <windowsx.h>
#include <psapi.h>
#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <chrono>

#include "red.h"
#include "json.h"
#include "plano.h"
#include "recursos.h"

#pragma comment(lib, "psapi.lib")

namespace {

enum class Pantalla { Acceso, Cargando, Plano, Error };

struct Pin { double x = 0, y = 0; std::string codigo; int pend = 0, proc = 0; bool produccion = true; };

struct Estado {
    Pantalla pantalla = Pantalla::Acceso;
    std::string correo, pin, aviso;
    int campo = 0;                       // 0 correo, 1 PIN

    std::vector<Pin> pines;
    double desplazaX = 0, desplazaY = 0, escala = 0.2;
    bool arrastrando = false;
    POINT dedo{};

    double msDibujo = 0, msPrimerPlano = 0, msEstirado = 0;
    bool moviendo = false;      // la mano está encima: se estira lo ya dibujado
    size_t memoriaMB = 0;
    std::atomic<bool> trabajando{false};
};

Estado g;
HWND g_ventana = nullptr;

std::wstring aAncho(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring w(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), w.data(), n);
    return w;
}

std::string escapa(const std::string& s) {
    std::string o;
    for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; }
    return o;
}

size_t memoriaAhora() {
    PROCESS_MEMORY_COUNTERS m{};
    GetProcessMemoryInfo(GetCurrentProcess(), &m, sizeof(m));
    return m.WorkingSetSize / (1024 * 1024);
}

void repinta() { InvalidateRect(g_ventana, nullptr, FALSE); }

// Redibujar nítido cuesta cientos de milisegundos, así que se pide para cuando
// la vista lleve un momento quieta. Cada movimiento vuelve a aplazar la cita: no
// tiene caso rasterizar una vista que ya cambió.
const UINT RELOJ_NITIDO = 1;
void pideNitido() {
    SetTimer(g_ventana, RELOJ_NITIDO, 160, nullptr);
}

// Entrar, buscar la primera obra con plano y bajarlo. Va en su propio hilo: si
// se hiciera en el de la ventana, la aplicación se quedaría tiesa mientras baja
// varios megas, que es justo lo que se le critica a las lentas.
void entraYCarga() {
    if (g.trabajando.exchange(true)) return;
    std::thread([] {
        auto reloj = std::chrono::steady_clock::now();
        auto fallar = [&](const std::string& m) {
            g.aviso = m; g.pantalla = Pantalla::Error; g.trabajando = false; repinta();
        };

        /* OJO: ESTA ENTRADA YA NO EXISTE DEL OTRO LADO.
         *
         * `/api/auth/pin` era el login propio de la bitácora. Se cerró el
         * 16-sep-2026 por encargo de Mike y hoy contesta 410 con un texto que
         * dice qué hacer. Esta app, tal como está compilada, no puede entrar:
         * es a propósito, y se rearma más adelante.
         *
         * CUANDO SE REARME: se entra como app empacada del contrato 0.8.0 de la
         * suite —`POST /s101/auth/entrar` con `{"aparato": true}`, que devuelve
         * `token`, y después `Authorization: Bearer <token>` en cada
         * petición—. El Worker de la bitácora ya acepta ese camino; no hay que
         * cambiar nada allá. Lo que cambia aquí son estas tres líneas y el
         * texto de la pantalla de entrada: ya no se pide un PIN de la bitácora,
         * se pide el de la cuenta de la suite. */
        std::string cuerpo = "{\"email\":\"" + escapa(g.correo) + "\",\"pin\":\"" + escapa(g.pin) + "\"}";
        auto r = red::pide(L"POST", "/api/auth/pin", cuerpo);
        if (!r.ok) { fallar(r.error.empty() ? "Correo o PIN incorrecto." : r.error); return; }
        Json sesion = Json::lee(r.cuerpo);
        red::guardaToken(sesion["token"].str());

        auto obras = red::pide(L"GET", "/api/projects");
        if (!obras.ok) { fallar("No se pudieron traer las obras."); return; }
        Json lista = Json::lee(obras.cuerpo)["projects"];
        if (lista.tam() == 0) { fallar("No hay obras en esta cuenta."); return; }

        // La primera obra que tenga plano: esto es un piloto, no el menú completo.
        for (size_t i = 0; i < lista.tam(); i++) {
            std::string id = lista[i]["id"].str();
            auto det = red::pide(L"GET", "/api/projects/" + id);
            if (!det.ok) continue;
            Json obra = Json::lee(det.cuerpo);
            Json planos = obra["plans"];
            if (planos.tam() == 0) continue;

            std::string fuente = planos[0]["source_key"].str();
            if (fuente.empty()) continue;   // sin PDF no hay nada nativo que dibujar

            auto arch = red::pide(L"GET", "/files/" + fuente, "", true);
            if (!arch.ok || arch.bytes.empty()) continue;
            if (!plano::abre(arch.bytes)) continue;

            std::string idPlano = planos[0]["id"].str();
            g.pines.clear();
            Json elems = obra["elements"];
            for (size_t k = 0; k < elems.tam(); k++) {
                if (elems[k]["plan_id"].str() != idPlano) continue;
                Pin p;
                p.x = elems[k]["x"].num();
                p.y = elems[k]["y"].num();
                p.codigo = elems[k]["code"].str();
                p.pend = (int)elems[k]["n_pend"].num();
                p.proc = (int)elems[k]["n_proc"].num();
                p.produccion = elems[k]["fase"].str("produccion") != "punchlist";
                g.pines.push_back(p);
            }

            RECT rc; GetClientRect(g_ventana, &rc);
            double anchoP = plano::ancho(), altoP = plano::alto();
            g.escala = min((rc.right - 48) / anchoP, (rc.bottom - 48) / altoP);
            g.desplazaX = (rc.right - anchoP * g.escala) / 2;
            g.desplazaY = (rc.bottom - altoP * g.escala) / 2;

            g.msPrimerPlano = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - reloj).count();
            g.pantalla = Pantalla::Plano;
            g.trabajando = false;
            repinta();
            return;
        }
        fallar("Ninguna obra tiene un plano en PDF.");
    }).detach();
}

void dibujaTexto(HDC dc, int x, int y, const std::wstring& t, int tam, COLORREF color, bool negrita = false) {
    HFONT f = CreateFontW(tam, 0, 0, 0, negrita ? FW_BOLD : FW_NORMAL, FALSE, FALSE, FALSE,
                          DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                          CLEARTYPE_QUALITY, VARIABLE_PITCH, L"Segoe UI");
    HFONT viejo = (HFONT)SelectObject(dc, f);
    SetTextColor(dc, color);
    SetBkMode(dc, TRANSPARENT);
    TextOutW(dc, x, y, t.c_str(), (int)t.size());
    SelectObject(dc, viejo);
    DeleteObject(f);
}

void pintaAcceso(HDC dc, RECT rc) {
    dibujaTexto(dc, 40, 40, L"t101pano", 40, RGB(28, 53, 87), true);
    dibujaTexto(dc, 40, 96, L"Prueba piloto nativa. Solo lectura.", 18, RGB(122, 133, 147));

    dibujaTexto(dc, 40, 160, L"Correo", 18, RGB(74, 85, 99));
    dibujaTexto(dc, 40, 186, aAncho(g.correo) + (g.campo == 0 ? L"_" : L""), 24, RGB(20, 28, 38));
    dibujaTexto(dc, 40, 236, L"PIN", 18, RGB(74, 85, 99));
    dibujaTexto(dc, 40, 262, std::wstring(g.pin.size(), L'*') + (g.campo == 1 ? L"_" : L""), 24, RGB(20, 28, 38));

    dibujaTexto(dc, 40, 330, L"Tab cambia de campo · Enter entra", 16, RGB(122, 133, 147));
    if (!g.aviso.empty()) dibujaTexto(dc, 40, 360, aAncho(g.aviso), 18, RGB(211, 58, 47));
}

void pintaPlano(HDC dc, RECT rc) {
    int w = rc.right, h = rc.bottom;
    auto reloj = std::chrono::steady_clock::now();

    // La primera vez hay que rasterizar; de ahí en adelante se usa lo guardado y
    // se vuelve a rasterizar solo cuando la vista se queda quieta.
    const plano::Dibujo* d = &plano::guardado();
    if (!d->vale || d->ancho != w || d->alto != h) {
        d = &plano::rasteriza(w, h, g.desplazaX, g.desplazaY, g.escala);
        g.msDibujo = d->ms;
    }

    if (d->ancho > 0) {
        // Lo guardado se dibujó con otra vista: se corre y se estira la
        // diferencia. Copiar píxeles cuesta microsegundos; rasterizar, cientos
        // de milisegundos. Ahí está toda la diferencia entre fluido y roto.
        double k = g.escala / d->escala;
        int dx = (int)(g.desplazaX - d->desplazaX * k);
        int dy = (int)(g.desplazaY - d->desplazaY * k);
        int dw = (int)(d->ancho * k);
        int dh = (int)(d->alto * k);

        BITMAPINFO bi{};
        bi.bmiHeader.biSize = sizeof(bi.bmiHeader);
        bi.bmiHeader.biWidth = d->ancho;
        bi.bmiHeader.biHeight = -d->alto;      // de arriba abajo
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = BI_RGB;
        SetStretchBltMode(dc, HALFTONE);
        StretchDIBits(dc, dx, dy, dw, dh, 0, 0, d->ancho, d->alto,
                      d->pixeles.data(), &bi, DIB_RGB_COLORS, SRCCOPY);
    }
    g.msEstirado = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - reloj).count();

    // Los pines, encima. El relleno dice el tipo en la web; aquí, en el piloto,
    // el aro dice el estado y el hueco la fase, que es lo que se compara.
    for (const auto& p : g.pines) {
        int cx = (int)(g.desplazaX + p.x * plano::ancho() * g.escala);
        int cy = (int)(g.desplazaY + p.y * plano::alto() * g.escala);
        if (cx < -30 || cy < -30 || cx > rc.right + 30 || cy > rc.bottom + 30) continue;

        COLORREF aro = p.pend > 0 ? RGB(211, 58, 47) : p.proc > 0 ? RGB(217, 154, 18) : RGB(46, 139, 87);
        HPEN pluma = CreatePen(PS_SOLID, 3, aro);
        HBRUSH brocha = CreateSolidBrush(p.produccion ? RGB(255, 255, 255) : RGB(44, 90, 160));
        HPEN plumaVieja = (HPEN)SelectObject(dc, pluma);
        HBRUSH brochaVieja = (HBRUSH)SelectObject(dc, brocha);
        Ellipse(dc, cx - 13, cy - 13, cx + 13, cy + 13);
        SelectObject(dc, plumaVieja);
        SelectObject(dc, brochaVieja);
        DeleteObject(pluma);
        DeleteObject(brocha);
    }

    // El medidor. Es el motivo de este piloto, así que va siempre a la vista.
    RECT caja{ 12, 12, 430, 108 };
    HBRUSH fondo = CreateSolidBrush(RGB(20, 28, 38));
    FillRect(dc, &caja, fondo);
    DeleteObject(fondo);
    wchar_t linea[200];
    // Mover cuesta esto, y es lo que se siente al arrastrar el plano.
    swprintf_s(linea, L"Al mover: %.1f ms  (%.0f cuadros/s)", g.msEstirado,
               g.msEstirado > 0.01 ? min(1000.0 / g.msEstirado, 999.0) : 999.0);
    dibujaTexto(dc, 24, 20, linea, 18, RGB(255, 255, 255), true);
    // Y rasterizar el PDF cuesta esto otro, una vez, al soltar.
    swprintf_s(linea, L"Rasterizar el PDF: %.0f ms (al soltar)", g.msDibujo);
    dibujaTexto(dc, 24, 46, linea, 18, RGB(200, 210, 220));
    swprintf_s(linea, L"Memoria: %zu MB · Plano en pantalla: %.0f ms · %d pines",
               g.memoriaMB, g.msPrimerPlano, (int)g.pines.size());
    dibujaTexto(dc, 24, 72, linea, 17, RGB(200, 210, 220));
}

LRESULT CALLBACK Proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
        case WM_CHAR: {
            if (g.pantalla != Pantalla::Acceso && g.pantalla != Pantalla::Error) break;
            if (g.pantalla == Pantalla::Error) { g.pantalla = Pantalla::Acceso; g.aviso.clear(); }
            wchar_t c = (wchar_t)wp;
            std::string& destino = g.campo == 0 ? g.correo : g.pin;
            if (c == VK_BACK) { if (!destino.empty()) destino.pop_back(); }
            else if (c == VK_TAB) { g.campo = 1 - g.campo; }
            else if (c == VK_RETURN) {
                if (g.correo.empty() || g.pin.size() != 6) g.aviso = "Falta el correo o el PIN de seis digitos.";
                else { g.aviso.clear(); g.pantalla = Pantalla::Cargando; entraYCarga(); }
            }
            else if (c >= 32 && c < 127) {
                if (g.campo == 1 && !(c >= '0' && c <= '9')) break;
                if (g.campo == 1 && destino.size() >= 6) break;
                destino += (char)c;
            }
            repinta();
            return 0;
        }
        case WM_LBUTTONDOWN:
            g.arrastrando = true;
            g.dedo = { GET_X_LPARAM(lp), GET_Y_LPARAM(lp) };
            SetCapture(hwnd);
            return 0;
        case WM_MOUSEMOVE:
            if (g.arrastrando) {
                int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
                g.desplazaX += x - g.dedo.x;
                g.desplazaY += y - g.dedo.y;
                g.dedo = { x, y };
                repinta();
                pideNitido();
            }
            return 0;
        case WM_LBUTTONUP:
            g.arrastrando = false;
            ReleaseCapture();
            return 0;
        case WM_MOUSEWHEEL: {
            if (g.pantalla != Pantalla::Plano) return 0;
            POINT p{ GET_X_LPARAM(lp), GET_Y_LPARAM(lp) };
            ScreenToClient(hwnd, &p);
            double factor = GET_WHEEL_DELTA_WPARAM(wp) > 0 ? 1.15 : 1 / 1.15;
            double nueva = max(0.02, min(20.0, g.escala * factor));
            double k = nueva / g.escala;
            g.desplazaX = p.x - (p.x - g.desplazaX) * k;
            g.desplazaY = p.y - (p.y - g.desplazaY) * k;
            g.escala = nueva;
            repinta();
            pideNitido();
            return 0;
        }
        case WM_TIMER:
            if (wp == RELOJ_NITIDO) {
                KillTimer(hwnd, RELOJ_NITIDO);
                if (g.pantalla == Pantalla::Plano) {
                    RECT rc; GetClientRect(hwnd, &rc);
                    auto& d = plano::rasteriza(rc.right, rc.bottom, g.desplazaX, g.desplazaY, g.escala);
                    g.msDibujo = d.ms;
                    repinta();
                }
            }
            return 0;

        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC dc = BeginPaint(hwnd, &ps);
            RECT rc; GetClientRect(hwnd, &rc);
            HBRUSH fondo = CreateSolidBrush(RGB(238, 240, 242));
            FillRect(dc, &rc, fondo);
            DeleteObject(fondo);
            g.memoriaMB = memoriaAhora();

            if (g.pantalla == Pantalla::Plano) pintaPlano(dc, rc);
            else if (g.pantalla == Pantalla::Cargando) dibujaTexto(dc, 40, 40, L"Entrando y bajando el plano…", 24, RGB(28, 53, 87));
            else pintaAcceso(dc, rc);

            EndPaint(hwnd, &ps);
            return 0;
        }
        case WM_ERASEBKGND: return 1;   // se pinta todo en WM_PAINT; sin esto, parpadea
        case WM_DESTROY: PostQuitMessage(0); return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

}  // namespace

int WINAPI wWinMain(HINSTANCE instancia, HINSTANCE, PWSTR, int mostrar) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    WNDCLASSEXW clase{};
    clase.cbSize = sizeof(clase);
    clase.lpfnWndProc = Proc;
    clase.hInstance = instancia;
    clase.lpszClassName = L"t101pano-nativo";
    clase.hIcon = LoadIconW(instancia, MAKEINTRESOURCEW(IDI_APP));
    clase.hIconSm = clase.hIcon;
    clase.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    RegisterClassExW(&clase);

    g_ventana = CreateWindowExW(0, L"t101pano-nativo", L"t101pano — piloto nativo",
                                WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1280, 860,
                                nullptr, nullptr, instancia, nullptr);
    if (!g_ventana) return 1;
    ShowWindow(g_ventana, mostrar);

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    plano::cierra();
    return 0;
}
