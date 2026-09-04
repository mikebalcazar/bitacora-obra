import React, { useEffect, useState, createContext, useContext } from 'react';
import { api, setToken } from './api.js';
import Login from './Login.jsx';
import Home from './Home.jsx';
import Project from './Project.jsx';
import Admin from './Admin.jsx';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState(undefined);
  const [route, setRoute] = useState(parseHash());
  const [toast, setToast] = useState(null);

  useEffect(() => { api.get('/me').then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  useEffect(() => { const f = () => setRoute(parseHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  const ctx = {
    user,
    go: (h) => { location.hash = h; },
    toast: (m) => setToast(m),
    logout: async () => { await api.post('/auth/logout').catch(() => {}); setToken(null); setUser(null); location.hash = ''; },
  };

  if (user === undefined) return <div className="center"><div className="spin" /></div>;
  if (!user) return <Login onLogin={(u) => setUser(u)} />;

  let view;
  if (route.page === 'p' && route.id) view = <Project key={route.id} id={route.id} sub={route.sub} />;
  else if (route.page === 'admin') view = <Admin />;
  else view = <Home />;

  return <Ctx.Provider value={ctx}>{view}{toast && <div className="toast">{toast}</div>}</Ctx.Provider>;
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, id, ...rest] = h.split('/');
  return { page: page || 'home', id: id || null, sub: rest.join('/') || null };
}
