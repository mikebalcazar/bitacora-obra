#include "red.h"
#include <windows.h>
#include <winhttp.h>
#include <mutex>

#pragma comment(lib, "winhttp.lib")

namespace red {

static const wchar_t* SERVIDOR = L"bitacora-obra.mike-929.workers.dev";
static std::string g_token;
static std::mutex g_candado;

void guardaToken(const std::string& t) { std::lock_guard<std::mutex> l(g_candado); g_token = t; }
std::string token() { std::lock_guard<std::mutex> l(g_candado); return g_token; }

static std::wstring aAncho(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring w(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), w.data(), n);
    return w;
}

Respuesta pide(const std::wstring& metodo, const std::string& ruta, const std::string& cuerpoJson, bool binario) {
    Respuesta r;
    HINTERNET sesion = WinHttpOpen(L"t101pano-nativo/0.1", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                   WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!sesion) { r.error = "No se pudo abrir la conexion"; return r; }

    HINTERNET conexion = WinHttpConnect(sesion, SERVIDOR, INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (!conexion) { WinHttpCloseHandle(sesion); r.error = "No se pudo conectar"; return r; }

    HINTERNET peticion = WinHttpOpenRequest(conexion, metodo.c_str(), aAncho(ruta).c_str(), nullptr,
                                            WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                                            WINHTTP_FLAG_SECURE);
    if (!peticion) {
        WinHttpCloseHandle(conexion); WinHttpCloseHandle(sesion);
        r.error = "No se pudo preparar la peticion"; return r;
    }

    std::wstring cabeceras = L"Content-Type: application/json\r\n";
    std::string t = token();
    if (!t.empty()) cabeceras += L"Authorization: Bearer " + aAncho(t) + L"\r\n";

    BOOL fue = WinHttpSendRequest(peticion, cabeceras.c_str(), (DWORD)-1,
                                  cuerpoJson.empty() ? WINHTTP_NO_REQUEST_DATA : (LPVOID)cuerpoJson.data(),
                                  (DWORD)cuerpoJson.size(), (DWORD)cuerpoJson.size(), 0);
    if (fue) fue = WinHttpReceiveResponse(peticion, nullptr);
    if (!fue) {
        r.error = "El servidor no contesto";
    } else {
        DWORD codigo = 0, tam = sizeof(codigo);
        WinHttpQueryHeaders(peticion, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                            WINHTTP_HEADER_NAME_BY_INDEX, &codigo, &tam, WINHTTP_NO_HEADER_INDEX);
        r.codigo = (int)codigo;

        // Se lee de corrido: un plano son varios megas y llega en pedazos.
        DWORD disponible = 0;
        do {
            disponible = 0;
            if (!WinHttpQueryDataAvailable(peticion, &disponible)) break;
            if (!disponible) break;
            std::vector<unsigned char> trozo(disponible);
            DWORD leidos = 0;
            if (!WinHttpReadData(peticion, trozo.data(), disponible, &leidos)) break;
            if (binario) r.bytes.insert(r.bytes.end(), trozo.begin(), trozo.begin() + leidos);
            else r.cuerpo.append((const char*)trozo.data(), leidos);
        } while (disponible > 0);
        r.ok = (codigo >= 200 && codigo < 300);
    }

    WinHttpCloseHandle(peticion);
    WinHttpCloseHandle(conexion);
    WinHttpCloseHandle(sesion);
    return r;
}

}  // namespace red
