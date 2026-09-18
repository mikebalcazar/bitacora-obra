/* La puerta de la suite, desde este mismo origen.
 *
 * Dentro del sitio, `/s101/*` lo atiende el Worker de quell101 y él se lo pasa
 * a `suite101-api` con `X-App: quell101` puesto por él: la app no decide quién
 * dice ser. Dentro de la app de Android o de Windows el sitio va empaquetado y
 * el servidor está en otro lado, así que la cookie no llega nunca: ahí se pide
 * la sesión con `aparato: true`, la suite devuelve el token y se guarda con el
 * mismo llavero de siempre (`bo_token`), que es el que `api.js` ya manda en
 * `Authorization` y en la dirección de las fotos.
 *
 * quell101 no guarda sesiones propias de aquí en adelante: la suite dice quién
 * es la persona, y la base de quell101 dice qué hace aquí —dueño, supervisor o
 * contratista— y en qué obras.
 */

import { BASE, empaquetada, setToken } from './api.js';

/** Los errores de la API, con palabras de obra. */
const ERRORES = {
  codigo_invalido: 'Ese código no es. Revisa el correo y vuelve a intentar.',
  pin_invalido: 'Ese PIN no es.',
  clave_invalida: 'Esa contraseña no es.',
  demasiados_intentos: 'Demasiados intentos. Espera un momento y vuelve a intentar.',
  sin_permiso: 'Ese correo no tiene acceso. Pídele a quien administra tu empresa que te dé de alta.',
  sin_sesion: 'Tu sesión terminó. Vuelve a entrar.',
  datos_invalidos: 'Revisa lo que escribiste.',
  correo_no_configurado: 'El envío de códigos no está disponible ahora. Intenta más tarde.',
  sin_respuesta: 'No hubo forma de llegar al servidor. Revisa tu señal.',
  google_no_configurado: 'Entrar con Google todavía no está prendido. Entra con tu correo.',
  origen_no_permitido: 'Esta dirección no está dada de alta para entrar con Google. Entra con tu correo.',
  entrada_invalida: 'El boleto de Google ya no sirve. Vuelve a intentar.',
  org_inactiva: 'La empresa está suspendida. Avísale a quien la administra.',
  org_sin_pago: 'La suscripción de la empresa venció. Avísale a quien la administra.',
};

export class ErrorSuite extends Error {
  constructor(error, estado, detalle) {
    super(detalle?.pin ?? detalle?.porque ?? ERRORES[error] ?? `Algo no salió bien (${error}). Vuelve a intentar.`);
    this.error = error; this.estado = estado; this.detalle = detalle;
  }
}

export async function suite(ruta, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(`${BASE}/s101${ruta}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // Empaquetada la cookie no sirve: la sesión va como token y pedirla
      // sería mandar una cookie de terceros que el navegador bloquea.
      credentials: empaquetada ? 'omit' : 'include',
    });
  } catch {
    throw new ErrorSuite('sin_respuesta', 0, null);
  }
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
  if (!r.ok || !cuerpo?.ok) throw new ErrorSuite(cuerpo?.error ?? 'sin_respuesta', r.status, cuerpo?.detalle);
  return cuerpo.data;
}

export const pedirCodigo = (correo) => suite('/auth/codigo', { method: 'POST', body: { correo } });

/** Entra y, si hace falta, se queda con el token. Devuelve lo que dijo la API. */
export async function entrarASuite(body) {
  const d = await suite('/auth/entrar', { method: 'POST', body: { ...body, ...(empaquetada ? { aparato: true } : {}) } });
  if (d.token) setToken(d.token);
  return d;
}

export const yo = () => suite('/yo');
export const ponerPin = (pin) => suite('/auth/pin', { method: 'POST', body: { pin } });

/* La contraseña de la cuenta de la suite. Una sola ruta pone y cambia: si ya
 * hay una, la suite pide la actual… salvo que la sesión se haya abierto con un
 * código al correo o con Google, que es lo que hace que «olvidé mi contraseña»
 * no necesite ruta aparte. Se entra con un código y se pone otra. */
export const ponerClave = (clave, actual) =>
  suite('/auth/clave', { method: 'POST', body: actual ? { clave, actual } : { clave } });
export const salirDeSuite = () => suite('/auth/salir', { method: 'POST' }).catch(() => {});

/** La ida a Google. La API devuelve a `volver_a` con un boleto de un solo uso,
 *  y al volver se canjea por la sesión de este origen. */
export const irAGoogle = () => {
  const volver = empaquetada ? BASE + '/' : location.origin + location.pathname;
  location.href = `${BASE}/s101/auth/google?volver_a=${encodeURIComponent(volver)}`;
};

/** ¿Venimos de Google? Se canjea el boleto y se limpia la dirección, para que
 *  recargar no intente canjear dos veces lo que ya se usó. */
export async function canjearSiVengoDeGoogle() {
  const u = new URL(location.href);
  const entrada = u.searchParams.get('entrada');
  if (!entrada) return false;
  u.searchParams.delete('entrada');
  history.replaceState(null, '', u.toString());
  const d = await suite('/auth/canje', { method: 'POST', body: { entrada, ...(empaquetada ? { aparato: true } : {}) } });
  if (d.token) setToken(d.token);
  return true;
}
