import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { vigilarAlto } from './alto.js';
import { escucharVueltaDeGoogle } from './nativo.js';

// Lo que Safari tapa abajo en el celular (alto.js): se mide antes de pintar.
vigilarAlto();
// En la app de Android, la vuelta de Google llega a la app (nativo.js).
escucharVueltaDeGoogle();

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
