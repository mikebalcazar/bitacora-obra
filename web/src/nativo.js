/* La app de Android (Capacitor) por dentro, sin importar nada.
 *
 * Los plugins nativos (`App`, `Browser`) los pone Capacitor en
 * `window.Capacitor.Plugins` cuando la pantalla corre dentro de la app; en el
 * navegador y en Windows no existen y todo esto contesta «no». Así la misma
 * pantalla sirve para las tres sin un paquete más que armar. */

const cap = () => (typeof window === 'undefined' ? null : window.Capacitor);
export const esAndroid = () => cap()?.getPlatform?.() === 'android';
export const plugin = (nombre) => cap()?.Plugins?.[nombre] || null;

/* Mike, 9-oct-2026: «si le pido "entrar con google" me manda al browser y abre
 * la aplicación en el browser, no en la app. Debería validar el usuario de
 * google dentro de la misma app». Google se abre en una pestaña que se monta
 * ENCIMA de la app (Custom Tab) y la suite devuelve el boleto a esta
 * dirección. Android se la entrega a la app —no al navegador— porque el
 * dominio la reconoce como suya (`/.well-known/assetlinks.json`, con la huella
 * de la llave fija) y el manifiesto la reclama (`apps/android/ligas.py`). */
export const VUELTA_GOOGLE = 'https://quell.suite101.app/app/entrar';

/** Cuando Android abre la app con la vuelta de Google: se cierra la pestaña y
 *  se recarga la pantalla con el boleto, que es lo que ya sabe canjear
 *  `canjearSiVengoDeGoogle` (con `aparato: true`, por ser empaquetada). */
export function escucharVueltaDeGoogle() {
  const App = plugin('App');
  if (!esAndroid() || !App) return;
  const llega = (url) => {
    let u;
    try { u = new URL(url); } catch { return; }
    if (!u.pathname.startsWith('/app/entrar')) return;
    const entrada = u.searchParams.get('entrada');
    plugin('Browser')?.close?.().catch?.(() => {});
    if (entrada) location.replace(`${location.pathname}?entrada=${encodeURIComponent(entrada)}`);
  };
  App.addListener('appUrlOpen', (e) => llega(e?.url));
  App.getLaunchUrl?.().then((r) => r?.url && llega(r.url)).catch(() => {});
}
