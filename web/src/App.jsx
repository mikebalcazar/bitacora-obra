import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import { api, setToken, alCambiarRed, vaciaFila, hayRed, revisaSenal } from './api.js';
import { mismaSenal } from './plano.js';
import { salirDeSuite } from './suite.js';
import Login from './Login.jsx';
import Home from './Home.jsx';
import Project from './Project.jsx';
import Admin from './Admin.jsx';
import VersionNueva from './VersionNueva.jsx';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState(undefined);
  const [route, setRoute] = useState(parseHash());
  const [toast, setToast] = useState(null);

  // La pantalla de arranque (index.html) se queda hasta saber quién entró; con
  // sesión o sin ella hay pantalla que enseñar, así que en los dos casos se quita.
  useEffect(() => {
    const splash = window.splash101;
    if (splash) splash.estado('Abriendo tu bitácora');
    api.get('/me').then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => { if (splash) splash.ocultar(); });
  }, []);
  useEffect(() => { const f = () => setRoute(parseHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  // Estado de la señal y de lo que falta subir. Se vacía la fila al abrir la
  // app, no solo cuando el navegador avisa que volvió la red: en obra la señal
  // va y viene sin que nadie se entere.
  //
  // BATERÍA (Mike, 29-sep-2026): el reintento de cada minuto sólo corre con la
  // pestaña a la vista y con algo por subir. Antes corría siempre —en segundo
  // plano y con la fila vacía— y cada vuelta leía la base local y volvía a
  // pintar toda la app, plano y pines incluidos. Un aviso igual al anterior
  // tampoco repinta nada.
  const [red, setRed] = useState({ faltan: 0, red: hayRed() });
  const faltan = useRef(0);
  useEffect(() => { faltan.current = red.faltan; }, [red.faltan]);
  useEffect(() => {
    const quita = alCambiarRed((n) => setRed((antes) => (mismaSenal(antes, n) ? antes : n)));
    vaciaFila();
    revisaSenal();   // lo que quedó por subir de la vez pasada, con o sin señal
    const toca = () => hayRed() && document.visibilityState === 'visible' && faltan.current > 0;
    const cada = setInterval(() => { if (toca()) vaciaFila(); }, 60000);
    const alVolver = () => { if (toca()) vaciaFila(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { quita(); clearInterval(cada); document.removeEventListener('visibilitychange', alVolver); };
  }, []);

  const ctx = useMemo(() => ({
    user,
    go: (h) => { location.hash = h; },
    toast: (m) => setToast(m),
    // Salir cierra las dos puertas: la de la suite, que es la de ahora, y la
    // vieja, por si esta pantalla vive dentro de una app todavía sin rearmar.
    logout: async () => {
      await salirDeSuite();
      await api.post('/auth/logout').catch(() => {});
      setToken(null); setUser(null); location.hash = '';
    },
  }), [user]);

  if (user === undefined) return <div className="center"><div className="spin" /></div>;
  if (!user) return <Login onLogin={(u) => setUser(u)} />;

  let view;
  if (route.page === 'p' && route.id) view = <Project key={route.id} id={route.id} sub={route.sub} />;
  else if (route.page === 'admin') view = <Admin />;
  else view = <Home />;

  return (
    <Ctx.Provider value={ctx}>
      {view}
      {(!red.red || red.faltan > 0) && (
        <div className={'senal' + (red.red ? ' subiendo' : '')} onClick={() => vaciaFila()}>
          {!red.red && <span>Sin señal · lo que registres se guarda aquí</span>}
          {red.red && red.faltan > 0 && <span>Subiendo {red.faltan} {red.faltan === 1 ? 'cambio' : 'cambios'}…</span>}
          {!red.red && red.faltan > 0 && <b>{red.faltan} por subir</b>}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      <VersionNueva />
    </Ctx.Provider>
  );
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id, ...rest] = h.split('/');
  return { page: page || 'home', id: id || null, sub: rest.join('/') || null };
}
