import React from 'react';

// El logotipo de quell101.
//
// Es el de taller101 con la palabra cambiada, así que aquí solo se dibuja el
// texto: la forma la manda la tipografía —Sansation Bold— y el espaciado
// apretado que se ajustó a mano en el original.
//
// Va en SVG y no como texto normal por una razón: un texto se dibuja con la
// fuente que tenga la máquina, y si falta Sansation cada quien vería otro
// logotipo. Aquí la fuente se carga con la página (styles.css, @font-face) y,
// el día que se tenga el archivo, esto se puede reemplazar por los trazos
// mismos y entonces ya no depende de nada.
export default function Marca({ alto = 28, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 260 56" height={alto} role="img" aria-label="quell101" style={{ display: 'block' }}>
      <text x="0" y="41" fill={color} className="wordmark">quell101</text>
    </svg>
  );
}
