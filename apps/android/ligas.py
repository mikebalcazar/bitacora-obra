"""La app de Android reclama la vuelta de Google (Mike, 9-oct-2026).

`npx cap add android` rehace el proyecto en cada corrida de «Armar apps», así
que el manifiesto se toca aquí, después de rehacerlo:

  · un intent-filter con `autoVerify` para https://quell101.taller101.com/app/entrar:
    Android verifica contra `/.well-known/assetlinks.json` (lo sirve el Worker)
    que ese dominio es de esta app y le entrega esa dirección a ELLA, no al
    navegador. Es por donde regresa el boleto de Google (web/src/nativo.js).

Truena si no encuentra dónde ponerlo: una app que no recibe la vuelta de Google
no se publica.
"""
import sys

RUTA = 'android/app/src/main/AndroidManifest.xml'
FILTRO = '''
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="quell101.taller101.com" android:pathPrefix="/app/entrar" />
            </intent-filter>'''

t = open(RUTA, encoding='utf-8').read()
if 'android:pathPrefix="/app/entrar"' in t:
    print('el manifiesto ya reclama /app/entrar')
    sys.exit(0)
# El primer intent-filter es el de MAIN/LAUNCHER de la actividad principal.
fin = t.find('</intent-filter>')
if fin < 0 or 'android.intent.category.LAUNCHER' not in t[:fin]:
    sys.exit('No encontré la actividad principal en el manifiesto: no se puede reclamar /app/entrar.')
fin += len('</intent-filter>')
t = t[:fin] + FILTRO + t[fin:]
open(RUTA, 'w', encoding='utf-8').write(t)
print('el manifiesto reclama https://quell101.taller101.com/app/entrar')
