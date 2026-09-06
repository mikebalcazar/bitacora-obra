import React, { useEffect, useState } from 'react';
import { api, setToken, empaquetada, BASE } from './api.js';

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
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [paso, setPaso] = useState('pin');        // pin | codigo | elige | confirma
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [aviso, setAviso] = useState('');
  const [devCode, setDevCode] = useState('');
  const [apps, setApps] = useState(null);

  useEffect(() => {
    if (empaquetada) return;
    api.get('/apps').then((r) => setApps(r.apps || {})).catch(() => setApps({}));
  }, []);

  const recuerda = () => { try { localStorage.setItem('bo_email', email); } catch {} };

  async function entrar(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/pin', { email, pin });
      recuerda();
      if (r.token) setToken(r.token);
      onLogin(r.user);
    } catch (x) { setErr(x.message); setPin(''); } finally { setBusy(false); }
  }

  async function pedirCodigo() {
    setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/request', { email });
      recuerda();
      if (r.dev_code) { setDevCode(r.dev_code); setCode(r.dev_code); }
      setAviso(`Te mandamos un código a ${email}. Vence en 10 minutos.`);
      setPaso('codigo');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  async function verificar(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/verify', { email, code });
      if (r.token) setToken(r.token);
      window.__boUser = r.user;
      setAviso(r.tiene_pin ? 'Elige tu nuevo PIN.' : 'Elige un PIN de seis dígitos.');
      setPaso('elige');
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
      await api.post('/pin', { pin: pin1 });
      onLogin({ ...(window.__boUser || {}), tiene_pin: true });
    } catch (x) {
      setErr(x.message); setPin1(''); setPin2(''); setPaso('elige');
    } finally { setBusy(false); }
  }

  const alEnviar = { pin: entrar, codigo: verificar, elige: siguiente, confirma: guardarPin }[paso];

  return (
    <div className="center">
      <form className="login" onSubmit={alEnviar}>
        <div className="logo"><i />t101pano</div>

        {paso === 'pin' && (
          <>
            <h1>Entrar</h1>
            <div className="field"><label>Correo</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" inputMode="email" autoComplete="username" />
            </div>
            <div className="field"><label>PIN</label>
              <Digitos valor={pin} onValor={setPin} autoComplete="current-password" />
            </div>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || pin.length !== 6 || !email}>{busy ? 'Entrando…' : 'Entrar'}</button>
            <button type="button" className="btn block" disabled={busy || !email} onClick={pedirCodigo}>
              Es mi primera vez / olvidé mi PIN
            </button>
          </>
        )}

        {paso === 'codigo' && (
          <>
            <h1>Código</h1>
            <p className="muted" style={{ margin: 0 }}>{aviso}</p>
            {devCode && <p className="muted" style={{ margin: 0 }}>Modo desarrollo · código: <b>{devCode}</b></p>}
            <Digitos autoFocus oculto={false} valor={code} onValor={setCode} autoComplete="one-time-code" />
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Continuar'}</button>
            <button type="button" className="btn block" onClick={() => { setPaso('pin'); setCode(''); setErr(''); }}>Regresar</button>
          </>
        )}

        {paso === 'elige' && (
          <>
            <h1>Tu PIN</h1>
            <p className="muted" style={{ margin: 0 }}>{aviso} Con él vas a entrar de ahora en adelante.</p>
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
      </form>

      {apps && (!!apps['android.apk'] || !!apps['windows.exe']) && (
        <div className="descargas">
          <span className="muted">Instálala en tu equipo:</span>
          {apps['android.apk'] && <a className="btn sm" href={`${BASE}/descargas/android.apk`}>Android <small className="muted">{pesa(apps['android.apk'].tamano)}</small></a>}
          {apps['windows.exe'] && <a className="btn sm" href={`${BASE}/descargas/windows.exe`}>Windows <small className="muted">{pesa(apps['windows.exe'].tamano)}</small></a>}
          {apps['windows-nativo.exe'] && <a className="btn sm" href={`${BASE}/descargas/windows-nativo.exe`}>Windows nativo <small className="muted">{pesa(apps['windows-nativo.exe'].tamano)}</small></a>}
        </div>
      )}
    </div>
  );
}
