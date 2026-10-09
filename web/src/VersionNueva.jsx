/* ¿Hay una versión nueva? (30-sep-2026)
 *
 * Mike: «Me gusta el letrero que aparece en quote cuando actualizas la
 * versión y estás usándolo, que te dice que guardes tu trabajo y refresques
 * la página. Haz eso para todas las webapps».
 *
 * Al armar, `scripts/huella.mjs` deja `dist/huella.txt` (la sha256 del
 * index.html armado: pública y sin datos). Se compara con la que había al
 * abrir; si cambió, se avisa y la persona decide cuándo recargar. Cada 2
 * minutos y cuando la pestaña vuelve a verse; no con el `focus`. */
import React, { useEffect, useState } from 'react';
import { BASE } from './api.js';
import { esAndroid, plugin } from './nativo.js';

/* En la app de Android la pantalla viaja DENTRO del .apk: su huella.txt es la
 * de la app instalada y nunca cambia. Ahí se compara otra cosa (Mike, 9-oct:
 * «que el app tenga un aviso automático de cuando hay una nueva versión para
 * que se actualice sola»): el número de armado con el que se hizo esta app
 * (`VITE_VERSION_ANDROID`, el número de corrida de «Armar apps») contra el que
 * publica `/descargas/android.json`. Si hay uno más nuevo, un botón la baja y
 * Android la instala encima (la llave de firma es siempre la misma). Android no
 * deja que una app que no viene de la tienda se instale sola sin que la
 * persona diga «Instalar»: eso es lo más automático que se puede. */
const ARMADO = Number(import.meta.env?.VITE_VERSION_ANDROID || 0);

async function hayApkNueva() {
  if (!esAndroid() || !ARMADO) return false;
  const r = await fetch(`${BASE}/descargas/android.json`, { cache: 'no-store' });
  if (!r.ok) return false;
  const v = Number((await r.json())?.version || 0);
  return v > ARMADO;
}

function bajarApk() {
  const url = `${BASE}/descargas/android.apk`;
  const Browser = plugin('Browser');
  if (Browser) Browser.open({ url }); else window.open(url, '_system');
}

export default function VersionNueva() {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    let base = null;
    let vivo = true;
    const revisar = async () => {
      if (esAndroid()) {
        try { if ((await hayApkNueva()) && vivo) setHay('apk'); } catch { /* sin señal */ }
        return;
      }
      try {
        const r = await fetch('/huella.txt', { cache: 'no-store' });
        if (!r.ok) return;
        const h = (await r.text()).trim();
        if (!/^[0-9a-f]{64}$/.test(h)) return;
        if (base === null) base = h;
        else if (h !== base && vivo) setHay(true);
      } catch { /* sin señal: se vuelve a intentar */ }
    };
    revisar();
    const cada = setInterval(revisar, 120000);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; clearInterval(cada); document.removeEventListener('visibilitychange', alVolver); };
  }, []);
  if (!hay) return null;
  if (hay === 'apk') return (
    <div id="aviso-version" data-version-nueva="apk" role="status">
      <span>Hay una versión nueva de la app.</span>
      <button type="button" onClick={bajarApk}>Actualizar</button>
    </div>
  );
  return (
    <div id="aviso-version" data-version-nueva="" role="status">
      <span>Hay una versión nueva de quell101. Termina lo que estés escribiendo, guarda, y recarga.</span>
      <button type="button" onClick={() => location.reload()}>Recargar</button>
    </div>
  );
}
