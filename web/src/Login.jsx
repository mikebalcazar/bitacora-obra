import React, { useState } from 'react';
import { api, setToken } from './api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('bo_email') || ''; } catch { return ''; } });
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [devCode, setDevCode] = useState('');

  async function request(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/request', { email });
      try { localStorage.setItem('bo_email', email); } catch {}
      if (r.dev_code) { setDevCode(r.dev_code); setCode(r.dev_code); }
      setStep('code');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/verify', { email, code });
      if (r.token) setToken(r.token);
      onLogin(r.user);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="center">
      <form className="login" onSubmit={step === 'email' ? request : verify}>
        <div className="logo"><i />Bitácora de Obra</div>
        {step === 'email' ? (
          <>
            <h1>Entrar</h1>
            <p className="muted" style={{ margin: 0 }}>Te mandamos un código de 6 dígitos a tu correo.</p>
            <div className="field"><label>Correo</label><input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" inputMode="email" autoComplete="email" /></div>
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy}>{busy ? 'Enviando…' : 'Enviar código'}</button>
          </>
        ) : (
          <>
            <h1>Código</h1>
            <p className="muted" style={{ margin: 0 }}>Enviado a <b>{email}</b>. Vence en 10 min.</p>
            {devCode && <p className="muted" style={{ margin: 0 }}>Modo desarrollo · código: <b>{devCode}</b></p>}
            <input className="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" />
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Entrar'}</button>
            <button type="button" className="btn block" onClick={() => { setStep('email'); setCode(''); setErr(''); }}>Cambiar correo</button>
          </>
        )}
      </form>
    </div>
  );
}
