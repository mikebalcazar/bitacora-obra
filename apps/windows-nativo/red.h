#pragma once
// Hablar con el servidor: entrar, traer obras y bajar archivos. Sin bibliotecas
// de terceros; WinHTTP viene con Windows.
#include <string>
#include <vector>

namespace red {

struct Respuesta {
    bool ok = false;
    int codigo = 0;
    std::string cuerpo;              // texto, para JSON
    std::vector<unsigned char> bytes; // binario, para PDF e imágenes
    std::string error;
};

// La sesión se guarda aquí y viaja en cada petición como encabezado.
void guardaToken(const std::string& t);
std::string token();

Respuesta pide(const std::wstring& metodo, const std::string& ruta, const std::string& cuerpoJson = "", bool binario = false);

}  // namespace red
