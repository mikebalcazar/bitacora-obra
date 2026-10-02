import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { vigilarAlto } from './alto.js';

// Lo que Safari tapa abajo en el celular (alto.js): se mide antes de pintar.
vigilarAlto();

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
