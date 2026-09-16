import React, { useEffect, useState } from 'react';
import { api, empaquetada, BASE } from './api.js';
import { pedirCodigo, entrarASuite, yo, ponerPin, canjearSiVengoDeGoogle, irAGoogle } from './suite.js';
import Marca from './Marca.jsx';

// La entrada de quell101 es la de la suite 101: el mismo correo y la misma
// sesión que dash101, peek101 y las demás. Aquí no se abre ninguna sesión
// propia; la suite dice quién es la persona y la base de quell101 dice qué
// hace en obra. Quien entra a la suite pero no está dado de alta aquí no pasa:
// dar de alta es decidir un rol, y eso lo hace una persona.

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
  const [modo, setModo] = useState('codigo');     // codigo | pin
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [paso, setPaso] = useState('correo');     // correo | clave | elige | confirma | sinalta
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
    if (!quien.tiene_pin) {
      window.__boUser = user;
      setAviso('Elige un PIN de seis dígitos.');
      setPin1(''); setPin2(''); setErr('');
      setPaso('elige');
      return;
    }
    onLogin(user);
  }

  async function seguir(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await pedirCodigo(email);
      recuerda();
      setAviso(`Te mandamos un código a ${email}. Vence en 10 minutos.`);
      setModo('codigo'); setDigitos(''); setPaso('clave');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  async function entrar(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await entrarASuite(modo === 'codigo' ? { correo: email, codigo: digitos } : { correo: email, pin: digitos });
      recuerda();
      await terminar();
    } catch (x) { setErr(x.message); setDigitos(''); } finally { setBusy(false); }
  }

  async function cambiarModo() {
    setErr('');
    if (modo === 'codigo') { setModo('pin'); setDigitos(''); setAviso(''); return; }
    setBusy(true);
    try {
      await pedirCodigo(email);
      setModo('codigo'); setDigitos('');
      setAviso(`Te mandamos un código a ${email}. Vence en 10 minutos.`);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  // Se teclea, se pasa de pantalla y se vuelve a teclear de memoria. Confirmar
  // teniendo el primero a la vista no confirma nada: se copia lo que se ve, y el
  // dedo que se equivocó las dos veces igual se equivoca.
  function siguiente(e) {
    e.preventDefault();
    setErr('');
    if (pin1.length !== 6) return;
    setPin2('');
    setPaso('confirma');
  }

  async function guardarPin(e) {
    e.preventDefault(); setErr('');
    if (pin1 !== pin2) {
      // No se dice cuál falló ni se deja el primero puesto: si no coincidieron,
      // uno de los dos está mal y no hay forma de saber cuál.
      setPin1(''); setPin2(''); setPaso('elige');
      setErr('No coincidieron. Vamos otra vez, desde el principio.');
      return;
    }
    setBusy(true);
    try {
      await ponerPin(pin1);
      onLogin(window.__boUser || {});
    } catch (x) {
      setErr(x.message); setPin1(''); setPin2(''); setPaso('elige');
    } finally { setBusy(false); }
  }

  const alEnviar = { correo: seguir, clave: entrar, elige: siguiente, confirma: guardarPin, sinalta: (e) => e.preventDefault() }[paso];
  const esCodigo = modo === 'codigo';

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
            <button className="btn primary block" disabled={busy || !email}>{busy ? 'Un momento…' : 'Continuar'}</button>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Te mandamos un código de 6 dígitos. Si ya tienes PIN, en la siguiente pantalla puedes entrar con él.
            </p>
            <button type="button" className="btn block" onClick={irAGoogle}>Entrar con Google</button>
          </>
        )}

        {paso === 'clave' && (
          <>
            <h1>{esCodigo ? 'Código' : 'Tu PIN'}</h1>
            {aviso && esCodigo && <p className="muted" style={{ margin: 0 }}>{aviso}</p>}
            {!esCodigo && <p className="muted" style={{ margin: 0 }}>El PIN de seis dígitos que pusiste en la suite.</p>}
            <Digitos
              key={modo}
              autoFocus
              oculto={!esCodigo}
              valor={digitos}
              onValor={setDigitos}
              autoComplete={esCodigo ? 'one-time-code' : 'current-password'}
            />
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || digitos.length !== 6}>{busy ? 'Entrando…' : 'Entrar'}</button>
            <button type="button" className="btn block" disabled={busy} onClick={cambiarModo}>
              {esCodigo ? 'Entrar con mi PIN' : 'Mándame un código al correo'}
            </button>
            <button type="button" className="btn block" onClick={() => { setPaso('correo'); setDigitos(''); setErr(''); setAviso(''); }}>Usar otro correo</button>
          </>
        )}

        {paso === 'elige' && (
          <>
            <h1>Tu PIN</h1>
            <p className="muted" style={{ margin: 0 }}>{aviso} Con él vas a entrar de ahora en adelante, aquí y en las demás apps de la suite.</p>
            <Digitos key="elige" autoFocus valor={pin1} onValor={setPin1} autoComplete="new-password" />
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Nada de 123456 ni seis veces el mismo número: son los primeros que alguien probaría.
            </p>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={pin1.length !== 6}>Continuar</button>
          </>
        )}

        {paso === 'confirma' && (
          <>
            <h1>Otra vez</h1>
            <p className="muted" style={{ margin: 0 }}>Tecléalo de nuevo, de memoria. Así sabemos que te lo vas a acordar mañana.</p>
            <Digitos key="confirma" autoFocus valor={pin2} onValor={setPin2} autoComplete="new-password" />
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || pin2.length !== 6}>{busy ? 'Guardando…' : 'Guardar PIN y entrar'}</button>
            <button type="button" className="btn block" onClick={() => { setPin1(''); setPin2(''); setErr(''); setPaso('elige'); }}>Empezar de nuevo</button>
          </>
        )}

        {paso === 'sinalta' && (
          <>
            <h1>Todavía no</h1>
            <p className="muted" style={{ margin: 0 }}>
              Tu cuenta entró a la suite, pero nadie te ha dado de alta en la bitácora de obra.
              Pídele a quien administra tu empresa que te agregue y vuelve a entrar.
            </p>
            <button type="button" className="btn block" onClick={() => { setPaso('correo'); setDigitos(''); setErr(''); }}>Usar otro correo</button>
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
