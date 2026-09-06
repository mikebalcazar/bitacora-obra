#pragma once
// Un lector de JSON del tamaño justo para lo que contesta el servidor: objetos,
// listas, textos y números. Traer una biblioteca entera para leer cinco campos
// sería cargar con lo que no se usa; esto son cien renglones que se leen de una
// sentada y no tienen dueño externo.
#include <string>
#include <vector>
#include <map>
#include <memory>

struct Json {
    enum class Tipo { Nulo, Bool, Numero, Texto, Lista, Objeto };
    Tipo tipo = Tipo::Nulo;
    bool booleano = false;
    double numero = 0;
    std::string texto;
    std::vector<Json> lista;
    std::map<std::string, Json> campos;

    // Se pide por nombre sin miedo: lo que no está devuelve un nulo, no revienta.
    const Json& operator[](const std::string& clave) const {
        static const Json vacio;
        auto it = campos.find(clave);
        return it == campos.end() ? vacio : it->second;
    }
    const Json& operator[](size_t i) const {
        static const Json vacio;
        return i < lista.size() ? lista[i] : vacio;
    }
    std::string str(const std::string& siNo = "") const { return tipo == Tipo::Texto ? texto : siNo; }
    double num(double siNo = 0) const { return tipo == Tipo::Numero ? numero : siNo; }
    size_t tam() const { return lista.size(); }
    bool hay() const { return tipo != Tipo::Nulo; }

    static Json lee(const std::string& s);
};
