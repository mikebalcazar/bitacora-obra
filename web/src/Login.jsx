import React, { useEffect, useState } from 'react';
import { api, empaquetada, BASE } from './api.js';
import { pedirCodigo, entrarASuite, yo, ponerClave, canjearSiVengoDeGoogle, irAGoogle } from './suite.js';
import Marca from './Marca.jsx';

// La entrada de quell101 es la de la suite 101: el mismo correo y la misma
// sesión que dash101, peek101 y las demás. Aquí no se abre ninguna sesión
// propia; la suite dice quién es la persona y la base de quell101 dice qué
// hace en obra. Quien entra a la suite pero no está dado de alta aquí no pasa:
// dar de alta es decidir un rol, y eso lo hace una persona.

// DESDE EL 16-SEP-2026 SE ENTRA CON GOOGLE O CON CORREO Y CONTRASEÑA, por
// encargo de Mike: la misma entrada en todas las apps de la suite menos
// roster101. El código de 6 dígitos al correo sigue existiendo, pero cambió de
// papel: ya no es una forma de entrar, es cómo se recupera una contraseña
// olvidada o se pone la primera. Y el PIN se fue de aquí.
//
// El PIN NO se fue de la suite, y eso no es olvido: el APK de Android que la
// gente de obra ya tiene instalado lleva su propia pantalla adentro, con PIN, y
// la API lo sigue aceptando para no dejarlos afuera el mismo día. Quien use ese
// APK pone su PIN desde «Mi PIN» en la pantalla principal. Las dos cosas se van
// cuando ese APK se rearme.
//
// Quien entra con un código y todavía no tiene contraseña no puede seguir sin
// ponerla: el código es de un solo uso y de diez minutos, así que dejarlo pasar
// sin contraseña es dejarlo sin manera de volver mañana. Con Google no se le
// pide: Google ya es una forma de entrar.

// El campo de dígitos vive AFUERA de la pantalla, a propósito. Definido adentro,
// React lo trata como un componente nuevo en cada tecleo: lo destruye, lo vuelve
// a crear y el foco se pierde, así que había que volver a picarle al campo
// después de cada número.
function Digitos({ valor, onValor, oculto = true, ...resto }) {
  return (
    <input
      className="code"
      type={oculto ? 'password' : 'text'}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={6}
      required
      value={valor}
      onChange={(e) => onValor(e.target.value.replace(/\D/g, '').slice(0, 6))}
      {...resto}
    />
  );
}

const pesa = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(0)} MB` : `${Math.round(b / 1024)} KB`);

export default function Login({ onLogin }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('bo_email') || ''; } catch { return ''; } });
  const [digitos, setDigitos] = useState('');
  const [clave, setClave] = useState('');
  const [nueva1, setNueva1] = useState('');
  const [nueva2, setNueva2] = useState('');
  // correo → clave → (olvidé) codigo → nueva → dentro. sinalta es la salida.
  const [paso, setPaso] = useState('correo');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [aviso, setAviso] = useState('');
  const [apps, setApps] = useState(null);

  useEffect(() => {
    if (empaquetada) return;
    api.get('/apps').then((r) => setApps(r.apps || {})).catch(() => setApps({}));
  }, []);

  // Si venimos de Google, el boleto se canjea antes de pintar nada.
  useEffect(() => {
    let vivo = true;
    canjearSiVengoDeGoogle()
      .then((vino) => { if (vino && vivo) return terminar(); })
      .catch((x) => { if (vivo) setErr(x.message); });
    return () => { vivo = false; };
  }, []);

  const recuerda = () => { try { localStorage.setItem('bo_email', email); } catch {} };

  /** Ya hay sesión de la suite. Falta saber qué es esta persona en la obra. */
  async function terminar() {
    const quien = await yo();
    let user = null;
    try {
      user = (await api.get('/me')).user;
    } catch (x) {
      if (x.status === 401 || x.status === 403) { setPaso('sinalta'); return; }
      throw x;
    }
    // Entró con un código y no tiene contraseña ni Google ligado: no tiene por
    // dónde volver mañana. Con Google sí la tiene —Google—, así que no se le
    // pide nada, ni al entrar con él ni después con un código. `tiene_google`
    // llegó con el contrato 0.17.2; una API vieja no lo manda y esto se
    // comporta como antes.
    if (!quien.tiene_clave && !quien.tiene_google && quien.entro_con === 'codigo') {
      window.__boUser = user;
      setNueva1(''); setNueva2(''); setErr('');
      setAviso('Ponle una contraseña a tu cuenta. Con ella entras aquí y en las demás apps de la suite.');
      setPaso('nueva');
      return;
    }
    onLogin(user);
  }

  /* El correo ya no dispara un código: lleva a la contraseña. Y no se le
   * pregunta a la API si esa persona tiene contraseña antes de pedirla — eso
   * convertiría la pantalla en un directorio de quién tiene cuenta aquí. */
  function seguir(e) {
    e.preventDefault(); setErr('');
    recuerda();
    setClave(''); setAviso(''); setPaso('clave');
  }

  async function entrar(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await entrarASuite({ correo: email, clave });
      recuerda();
      await terminar();
    } catch (x) { setErr(x.message); setClave(''); } finally { setBusy(false); }
  }

  async function entrarConCodigo(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await entrarASuite({ correo: email, codigo: digitos });
      recuerda();
      await terminar();
    } catch (x) { setErr(x.message); setDigitos(''); } finally { setBusy(false); }
  }

  /** «Olvidé mi contraseña», y también «no tengo todavía»: son lo mismo. */
  async function mandarCodigo() {
    setBusy(true); setErr('');
    try {
      await pedirCodigo(email);
      recuerda();
      setAviso(`Te mandamos un código a ${email}. Vence en 10 minutos.`);
      setDigitos(''); setPaso('codigo');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  /* Se teclea, se pasa de pantalla y se vuelve a teclear de memoria. Confirmar
   * teniendo la primera a la vista no confirma nada: se copia lo que se ve, y
   * el dedo que se equivocó las dos veces igual se equivoca. Es la misma regla
   * que traía el PIN, y sigue valiendo. */
  function siguiente(e) {
    e.preventDefault(); setErr('');
    if (nueva1.length < 10) return;
    setNueva2(''); setPaso('confirma');
  }

  async function guardarClave(e) {
    e.preventDefault(); setErr('');
    if (nueva1 !== nueva2) {
      // No se dice cuál falló ni se deja la primera puesta: si no coincidieron,
      // una de las dos está mal y no hay forma de saber cuál.
      setNueva1(''); setNueva2(''); setPaso('nueva');
      setErr('No coincidieron. Vamos otra vez, desde el principio.');
      return;
    }
    setBusy(true);
    try {
      await ponerClave(nueva1);
      onLogin(window.__boUser || {});
    } catch (x) {
      // La suite dice con palabras por qué una contraseña no pasa (corta, con
      // tu propio correo dentro, de las obvias). Eso se enseña tal cual: es
      // más útil que «contraseña inválida».
      setErr(x.message); setNueva1(''); setNueva2(''); setPaso('nueva');
    } finally { setBusy(false); }
  }

  const alEnviar = {
    correo: seguir, clave: entrar, codigo: entrarConCodigo,
    nueva: siguiente, confirma: guardarClave, sinalta: (e) => e.preventDefault(),
  }[paso];

  return (
    <div className="center">
      <form className="login" onSubmit={alEnviar}>
        <Marca alto={30} />

        {paso === 'correo' && (
          <>
            <h1>Entrar</h1>
            <div className="field"><label>Correo</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" inputMode="email" autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
            </div>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={!email}>Continuar</button>
            <button type="button" className="btn block" onClick={irAGoogle}>Entrar con Google</button>
          </>
        )}

        {paso === 'clave' && (
          <>
            <h1>Tu contraseña</h1>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>La de tu cuenta de la suite: la misma de las demás aplicaciones.</p>
            <div className="field"><label>Contraseña</label>
              {/* `name` y `autoComplete` van puestos para que el administrador
                  de contraseñas del teléfono la guarde y la vuelva a poner. En
                  obra se teclea con una mano y con guantes. */}
              <input
                type="password" name="password" required autoFocus
                value={clave} onChange={(e) => setClave(e.target.value)}
                autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck="false"
              />
            </div>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || !clave}>{busy ? 'Entrando…' : 'Entrar'}</button>
            <button type="button" className="btn block" disabled={busy} onClick={mandarCodigo}>
              Olvidé mi contraseña
            </button>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Si es tu primera vez y todavía no tienes una, pícale ahí mismo: te
              mandamos un código al correo y la pones.
            </p>
            <button type="button" className="btn block" onClick={() => { setPaso('correo'); setClave(''); setErr(''); setAviso(''); }}>Usar otro correo</button>
          </>
        )}

        {paso === 'codigo' && (
          <>
            <h1>Código</h1>
            {aviso && <p className="muted" style={{ margin: 0 }}>{aviso}</p>}
            <Digitos key="codigo" autoFocus oculto={false} valor={digitos} onValor={setDigitos} autoComplete="one-time-code" />
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || digitos.length !== 6}>{busy ? 'Entrando…' : 'Continuar'}</button>
            <button type="button" className="btn block" disabled={busy} onClick={mandarCodigo}>Mándame otro</button>
            <button type="button" className="btn block" onClick={() => { setPaso('correo'); setDigitos(''); setErr(''); setAviso(''); }}>Usar otro correo</button>
          </>
        )}

        {paso === 'nueva' && (
          <>
            <h1>Tu contraseña</h1>
            <p className="muted" style={{ margin: 0 }}>{aviso}</p>
            <div className="field"><label>Contraseña nueva</label>
              <input
                type="password" name="new-password" required autoFocus
                value={nueva1} onChange={(e) => setNueva1(e.target.value)}
                autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck="false"
              />
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Al menos diez caracteres. Que no lleve tu correo adentro ni sea de
              las que cualquiera prueba primero.
            </p>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={nueva1.length < 10}>Continuar</button>
          </>
        )}

        {paso === 'confirma' && (
          <>
            <h1>Otra vez</h1>
            <p className="muted" style={{ margin: 0 }}>Tecléala de nuevo, de memoria. Así sabemos que te la vas a acordar mañana.</p>
            <div className="field"><label>Otra vez</label>
              <input
                type="password" name="new-password" required autoFocus
                value={nueva2} onChange={(e) => setNueva2(e.target.value)}
                autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck="false"
              />
            </div>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || nueva2.length < 10}>{busy ? 'Guardando…' : 'Guardar y entrar'}</button>
            <button type="button" className="btn block" onClick={() => { setNueva1(''); setNueva2(''); setErr(''); setPaso('nueva'); }}>Empezar de nuevo</button>
          </>
        )}

        {paso === 'sinalta' && (
          <>
            <h1>Todavía no</h1>
            <p className="muted" style={{ margin: 0 }}>
              Tu cuenta entró a la suite, pero nadie te ha dado de alta en la bitácora de obra.
              Pídele a quien administra tu empresa que te agregue y vuelve a entrar.
            </p>
            <button type="button" className="btn block" onClick={() => { setPaso('correo'); setDigitos(''); setClave(''); setErr(''); }}>Usar otro correo</button>
          </>
        )}
      </form>

      {apps && (!!apps['android.apk'] || !!apps['windows.exe']) && (
        <div className="descargas">
          <span className="muted">Instálala en tu equipo:</span>
          {apps['android.apk'] && <a className="btn sm" href={`${BASE}/descargas/android.apk`}>Android <small className="muted">{pesa(apps['android.apk'].tamano)}</small></a>}
          {apps['windows.exe'] && <a className="btn sm" href={`${BASE}/descargas/windows.exe`}>Windows <small className="muted">{pesa(apps['windows.exe'].tamano)}</small></a>}
          {apps['windows-nativo.exe'] && <a className="btn sm" href={`${BASE}/descargas/windows-nativo.exe`}>Windows nativo <small className="muted">{pesa(apps['windows-nativo.exe'].tamano)}</small></a>}
          {apps['piloto.zip'] && <a className="btn sm" href={`${BASE}/descargas/piloto.zip`}>Piloto C++ <small className="muted">{pesa(apps['piloto.zip'].tamano)}</small></a>}
        </div>
      )}
    </div>
  );
}
