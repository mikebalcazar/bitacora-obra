import React, { useState } from 'react';
import { api, setToken } from './api.js';

// Entrar es correo + PIN de seis dígitos, y ya. El código por correo sigue ahí,
// pero como puerta de la primera vez y como salida cuando alguien olvida su PIN:
// en obra, esperar un correo cada mañana para abrir un plano es lo que hace que
// la gente deje de usar la app.
export default function Login({ onLogin }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('bo_email') || ''; } catch { return ''; } });
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [paso, setPaso] = useState('pin');   // pin | codigo | nuevo
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [aviso, setAviso] = useState('');
  const [devCode, setDevCode] = useState('');

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
      // Con o sin PIN puesto, aquí se elige uno: si llegó por olvido, es justo
      // lo que venía a hacer.
      setAviso(r.tiene_pin ? 'Elige tu nuevo PIN. Con él vas a entrar de ahora en adelante.' : 'Elige un PIN de seis dígitos. Con él vas a entrar de ahora en adelante.');
      setPaso('nuevo');
      window.__boUser = r.user;
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  async function guardarPin(e) {
    e.preventDefault(); setBusy(true); setErr('');
    if (pin1 !== pin2) { setErr('Los dos PIN no son iguales.'); setBusy(false); return; }
    try {
      await api.post('/pin', { pin: pin1 });
      onLogin({ ...(window.__boUser || {}), tiene_pin: true });
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  const Digitos = (props) => (
    <input className="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} required
      {...props} onChange={(e) => props.onValor(e.target.value.replace(/\D/g, '').slice(0, 6))} />
  );

  return (
    <div className="center">
      <form className="login" onSubmit={paso === 'pin' ? entrar : paso === 'codigo' ? verificar : guardarPin}>
        <div className="logo"><i />Bitácora de Obra</div>

        {paso === 'pin' && (
          <>
            <h1>Entrar</h1>
            <div className="field"><label>Correo</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" inputMode="email" autoComplete="username" />
            </div>
            <div className="field"><label>PIN</label>
              <Digitos value={pin} onValor={setPin} autoComplete="current-password" placeholder="······" />
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
            <Digitos autoFocus value={code} onValor={setCode} autoComplete="one-time-code" />
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Continuar'}</button>
            <button type="button" className="btn block" onClick={() => { setPaso('pin'); setCode(''); setErr(''); }}>Regresar</button>
          </>
        )}

        {paso === 'nuevo' && (
          <>
            <h1>Tu PIN</h1>
            <p className="muted" style={{ margin: 0 }}>{aviso}</p>
            <div className="field"><label>PIN</label><Digitos autoFocus value={pin1} onValor={setPin1} autoComplete="new-password" /></div>
            <div className="field"><label>Otra vez</label><Digitos value={pin2} onValor={setPin2} autoComplete="new-password" /></div>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Nada de 123456 ni seis veces el mismo número: son los primeros que alguien probaría.
            </p>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || pin1.length !== 6 || pin2.length !== 6}>{busy ? 'Guardando…' : 'Guardar PIN y entrar'}</button>
          </>
        )}
      </form>
    </div>
  );
}
