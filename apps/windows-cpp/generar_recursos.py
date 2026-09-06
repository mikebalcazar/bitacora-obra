#!/usr/bin/env python3
"""Mete la aplicación web dentro del ejecutable.

Cada archivo que salió del armado —el HTML, el JavaScript, los íconos— se vuelve
un recurso incrustado, y el programa los sirve desde su propia memoria. Así el
ejecutable es UN archivo: se copia a una USB y funciona, sin carpeta al lado que
alguien pueda borrar por accidente.
"""
import sys, os

MIMES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
    '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}

def main(origen, destino):
    os.makedirs(destino, exist_ok=True)
    archivos = []
    for raiz, _, nombres in os.walk(origen):
        for n in sorted(nombres):
            entero = os.path.join(raiz, n)
            rel = os.path.relpath(entero, origen).replace('\\', '/')
            archivos.append((rel, entero))
    archivos.sort()

    with open(os.path.join(destino, 'recursos.rc'), 'w', encoding='utf-8') as rc:
        rc.write('#include "recursos.h"\n\n')
        rc.write('IDI_APP ICON "icono.ico"\n\n')
        for i, (rel, entero) in enumerate(archivos, start=1000):
            ruta = os.path.abspath(entero).replace('\\', '\\\\')
            rc.write(f'{i} RCDATA "{ruta}"\n')

    with open(os.path.join(destino, 'archivos.h'), 'w', encoding='utf-8') as h:
        h.write('// Generado por generar_recursos.py. No editar a mano.\n')
        h.write('#pragma once\n#include <windows.h>\n\n')
        h.write('struct Archivo { const wchar_t* ruta; int id; const wchar_t* tipo; };\n\n')
        h.write('static const Archivo ARCHIVOS[] = {\n')
        for i, (rel, entero) in enumerate(archivos, start=1000):
            ext = os.path.splitext(rel)[1].lower()
            tipo = MIMES.get(ext, 'application/octet-stream')
            h.write(f'    {{ L"/{rel}", {i}, L"{tipo}" }},\n')
        h.write('};\n')
        h.write(f'static const int CUANTOS_ARCHIVOS = {len(archivos)};\n')

    print(f'{len(archivos)} archivos incrustados')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
