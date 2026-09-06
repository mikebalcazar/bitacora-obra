#include "json.h"

namespace {

struct Lector {
    const std::string& s;
    size_t i = 0;
    explicit Lector(const std::string& t) : s(t) {}

    void espacios() { while (i < s.size() && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++; }
    bool viene(char c) { espacios(); return i < s.size() && s[i] == c; }
    bool come(char c) { if (viene(c)) { i++; return true; } return false; }

    std::string texto() {
        std::string out;
        if (!come('"')) return out;
        while (i < s.size() && s[i] != '"') {
            if (s[i] == '\\' && i + 1 < s.size()) {
                i++;
                char c = s[i++];
                switch (c) {
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'u': {
                        // Se guarda en UTF-8, que es lo que espera el resto del programa.
                        unsigned code = 0;
                        for (int k = 0; k < 4 && i < s.size(); k++, i++) {
                            char h = s[i];
                            code = code * 16 + (h >= '0' && h <= '9' ? h - '0' : (h | 32) - 'a' + 10);
                        }
                        if (code < 0x80) out += (char)code;
                        else if (code < 0x800) { out += (char)(0xC0 | (code >> 6)); out += (char)(0x80 | (code & 0x3F)); }
                        else { out += (char)(0xE0 | (code >> 12)); out += (char)(0x80 | ((code >> 6) & 0x3F)); out += (char)(0x80 | (code & 0x3F)); }
                        break;
                    }
                    default: out += c;
                }
            } else {
                out += s[i++];
            }
        }
        come('"');
        return out;
    }

    Json valor() {
        espacios();
        if (i >= s.size()) return Json{};
        char c = s[i];
        Json j;
        if (c == '{') {
            i++;
            j.tipo = Json::Tipo::Objeto;
            while (!come('}') && i < s.size()) {
                espacios();
                std::string clave = texto();
                come(':');
                j.campos[clave] = valor();
                come(',');
            }
        } else if (c == '[') {
            i++;
            j.tipo = Json::Tipo::Lista;
            while (!come(']') && i < s.size()) {
                j.lista.push_back(valor());
                come(',');
            }
        } else if (c == '"') {
            j.tipo = Json::Tipo::Texto;
            j.texto = texto();
        } else if (c == 't' || c == 'f') {
            j.tipo = Json::Tipo::Bool;
            j.booleano = (c == 't');
            while (i < s.size() && isalpha((unsigned char)s[i])) i++;
        } else if (c == 'n') {
            while (i < s.size() && isalpha((unsigned char)s[i])) i++;
        } else {
            j.tipo = Json::Tipo::Numero;
            size_t fin = i;
            while (fin < s.size() && (isdigit((unsigned char)s[fin]) || s[fin] == '-' || s[fin] == '+' || s[fin] == '.' || s[fin] == 'e' || s[fin] == 'E')) fin++;
            j.numero = atof(s.substr(i, fin - i).c_str());
            i = fin;
        }
        return j;
    }
};

}  // namespace

Json Json::lee(const std::string& s) {
    Lector l(s);
    return l.valor();
}
