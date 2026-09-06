// t101pano para Windows, nativo.
//
// Una ventana de Windows escrita en C++ que muestra la misma aplicación de
// siempre usando el WebView del sistema —el motor de Edge, que ya viene con
// Windows—. La versión de Electron traía su propio navegador completo adentro:
// ochenta y dos megas, y otra copia del navegador en memoria. Esta pesa unos
// tres y arranca sin esperar.
//
// La aplicación web va incrustada dentro del propio ejecutable, así que es UN
// archivo: se copia a una USB y funciona, sin carpeta al lado que alguien pueda
// borrar por accidente.

#include <windows.h>
#include <shlwapi.h>
#include <wrl.h>
#include <wil/com.h>
#include <string>
#include "WebView2.h"
#include "recursos.h"
#include "archivos.h"

using namespace Microsoft::WRL;

// El sitio incrustado necesita un origen, porque una página sin origen —abierta
// como archivo suelto— no puede guardar nada ni hablar con el servidor. Este
// nombre no existe en internet: lo atiende el propio programa, y el servidor lo
// tiene en su lista de orígenes permitidos.
static const wchar_t* ORIGEN = L"https://app.t101pano";
static const wchar_t* INICIO = L"https://app.t101pano/index.html";

static wil::com_ptr<ICoreWebView2Controller> g_control;
static wil::com_ptr<ICoreWebView2> g_web;

// ¿Dónde guarda el WebView lo suyo —la sesión, la base local con lo que falta
// subir—? En la carpeta del usuario, no junto al ejecutable: si el programa vive
// en una USB o en Archivos de programa, ahí no se puede escribir.
static std::wstring carpetaDatos() {
    wchar_t ruta[MAX_PATH]{};
    if (SUCCEEDED(SHGetFolderPathW(nullptr, 0x001c /*CSIDL_LOCAL_APPDATA*/, nullptr, 0, ruta))) {
        std::wstring d = std::wstring(ruta) + L"\\t101pano";
        CreateDirectoryW(d.c_str(), nullptr);
        return d;
    }
    return L"";
}

static const Archivo* buscaArchivo(const std::wstring& ruta) {
    for (int i = 0; i < CUANTOS_ARCHIVOS; i++) {
        if (ruta == ARCHIVOS[i].ruta) return &ARCHIVOS[i];
    }
    return nullptr;
}

// Entregar un archivo incrustado. Lo que no exista devuelve la página de inicio:
// las rutas de la aplicación viven en el navegador, no en disco, así que pedir
// /p/algo no es un archivo perdido, es una pantalla.
static void responde(ICoreWebView2Environment* env, ICoreWebView2WebResourceRequestedEventArgs* args) {
    wil::com_ptr<ICoreWebView2WebResourceRequest> pedido;
    if (FAILED(args->get_Request(&pedido))) return;

    wil::unique_cotaskmem_string uri;
    if (FAILED(pedido->get_Uri(&uri))) return;

    std::wstring direccion(uri.get());
    std::wstring ruta = L"/index.html";
    size_t inicio = direccion.find(L"://");
    if (inicio != std::wstring::npos) {
        size_t barra = direccion.find(L'/', inicio + 3);
        if (barra != std::wstring::npos) {
            ruta = direccion.substr(barra);
            size_t corte = ruta.find_first_of(L"?#");
            if (corte != std::wstring::npos) ruta = ruta.substr(0, corte);
        }
    }
    if (ruta == L"/") ruta = L"/index.html";

    const Archivo* a = buscaArchivo(ruta);
    if (!a) a = buscaArchivo(L"/index.html");
    if (!a) return;

    HRSRC r = FindResourceW(nullptr, MAKEINTRESOURCEW(a->id), RT_RCDATA);
    if (!r) return;
    HGLOBAL h = LoadResource(nullptr, r);
    if (!h) return;
    void* datos = LockResource(h);
    DWORD tam = SizeofResource(nullptr, r);
    if (!datos || !tam) return;

    wil::com_ptr<IStream> flujo;
    flujo.attach(SHCreateMemStream(static_cast<const BYTE*>(datos), tam));
    if (!flujo) return;

    std::wstring cabeceras = std::wstring(L"Content-Type: ") + a->tipo + L"\r\nCache-Control: no-cache\r\n";
    wil::com_ptr<ICoreWebView2WebResourceResponse> respuesta;
    if (SUCCEEDED(env->CreateWebResourceResponse(flujo.get(), 200, L"OK", cabeceras.c_str(), &respuesta))) {
        args->put_Response(respuesta.get());
    }
}

static LRESULT CALLBACK ProcVentana(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
        case WM_SIZE:
            if (g_control) {
                RECT r; GetClientRect(hwnd, &r);
                g_control->put_Bounds(r);
            }
            return 0;
        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

int WINAPI wWinMain(HINSTANCE instancia, HINSTANCE, PWSTR, int mostrar) {
    // La aplicación se dibuja sola a la resolución del monitor: sin esto, en una
    // pantalla de portátil moderna todo sale borroso y agrandado por Windows.
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    WNDCLASSEXW clase{};
    clase.cbSize = sizeof(clase);
    clase.lpfnWndProc = ProcVentana;
    clase.hInstance = instancia;
    clase.lpszClassName = L"t101pano";
    clase.hIcon = LoadIconW(instancia, MAKEINTRESOURCEW(IDI_APP));
    clase.hIconSm = clase.hIcon;
    clase.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    clase.hbrBackground = CreateSolidBrush(RGB(0xEE, 0xF0, 0xF2));
    RegisterClassExW(&clase);

    HWND ventana = CreateWindowExW(0, L"t101pano", L"t101pano", WS_OVERLAPPEDWINDOW,
                                   CW_USEDEFAULT, CW_USEDEFAULT, 1280, 860,
                                   nullptr, nullptr, instancia, nullptr);
    if (!ventana) return 1;
    ShowWindow(ventana, mostrar);

    std::wstring datos = carpetaDatos();
    HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
        nullptr, datos.empty() ? nullptr : datos.c_str(), nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [ventana](HRESULT res, ICoreWebView2Environment* env) -> HRESULT {
                if (FAILED(res) || !env) return res;
                wil::com_ptr<ICoreWebView2Environment> entorno = env;
                return env->CreateCoreWebView2Controller(ventana,
                    Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [ventana, entorno](HRESULT res2, ICoreWebView2Controller* control) -> HRESULT {
                            if (FAILED(res2) || !control) return res2;
                            g_control = control;
                            g_control->get_CoreWebView2(&g_web);

                            wil::com_ptr<ICoreWebView2Settings> ajustes;
                            if (SUCCEEDED(g_web->get_Settings(&ajustes))) {
                                // Nada de menú del navegador ni de herramientas de
                                // desarrollo: esto es una aplicación, no una pestaña.
                                ajustes->put_AreDefaultContextMenusEnabled(FALSE);
                                ajustes->put_AreDevToolsEnabled(FALSE);
                                ajustes->put_IsStatusBarEnabled(FALSE);
                            }

                            EventRegistrationToken t{};
                            g_web->AddWebResourceRequestedFilter(L"https://app.t101pano/*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
                            g_web->add_WebResourceRequested(
                                Callback<ICoreWebView2WebResourceRequestedEventHandler>(
                                    [entorno](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* args) -> HRESULT {
                                        responde(entorno.get(), args);
                                        return S_OK;
                                    }).Get(), &t);

                            RECT r; GetClientRect(ventana, &r);
                            g_control->put_Bounds(r);
                            g_web->Navigate(INICIO);
                            return S_OK;
                        }).Get());
            }).Get());

    if (FAILED(hr)) {
        // Sin WebView2 no hay nada que mostrar, y decirlo de frente vale más que
        // una ventana en blanco: viene con Windows 11 y con Edge en Windows 10.
        MessageBoxW(ventana,
            L"Falta el componente WebView2 de Microsoft, que es lo que dibuja la aplicación.\n\n"
            L"Se descarga gratis del sitio de Microsoft (Microsoft Edge WebView2 Runtime) "
            L"y ya viene incluido en Windows 11.",
            L"t101pano", MB_ICONWARNING | MB_OK);
        return 1;
    }

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}
