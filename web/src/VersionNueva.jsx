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

export default function VersionNueva() {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    let base = null;
    let vivo = true;
    const revisar = async () => {
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
  return (
    <div id="aviso-version" data-version-nueva="" role="status">
      <span>Hay una versión nueva de quell101. Termina lo que estés escribiendo, guarda, y recarga.</span>
      <button type="button" onClick={() => location.reload()}>Recargar</button>
    </div>
  );
}
