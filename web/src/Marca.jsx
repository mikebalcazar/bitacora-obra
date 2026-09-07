import React from 'react';

// El logotipo de quell101: el de taller101 con la palabra cambiada, en Sansation
// Bold y con el espaciado apretado a mano (-0.035 em).
//
// Va en trazos, no en texto. Un texto se dibuja con la fuente que tenga la
// máquina: sin Sansation instalada, cada quien vería otro logotipo. Convertido a
// formas se ve idéntico en todas partes, no hay que cargar una fuente entera
// para ocho letras, y ningún navegador lo desarma mientras carga.
//
// Para cambiar el apretado hay que volver a generar este trazo desde la fuente;
// estirarlo aquí deformaría las letras, que es lo que nunca se le hace a un
// logotipo.
export default function Marca({ alto = 28, color = 'currentColor', titulo = 'quell101' }) {
  return (
    <svg viewBox="75 0 6605 1840" height={alto} role="img" aria-label={titulo}
      style={{ display: 'block', width: 'auto' }}>
      <g transform="translate(0,1460) scale(1,-1)">
        <path d="M797.0 812.0Q702.0 836.0 622.0 836.0Q337.0 836.0 337.0 533.0Q337.0 220.0 584.0 220.0Q708.0 220.0 797.0 274.0ZM1062.0 -380.0H797.0V50.0Q689.0 0.0 553.0 0.0Q75.0 0.0 75.0 531.0Q75.0 1050.0 620.0 1050.0Q823.0 1050.0 1062.0 1007.0Z M2185.3199999999997 1050.0V0.0H1978.32L1946.32 134.0Q1765.32 0.0 1562.32 0.0Q1240.32 0.0 1240.32 381.0V1050.0H1505.32V388.0Q1505.32 214.0 1657.32 214.0Q1786.32 214.0 1920.32 317.0V1050.0Z M2806.64 1050.0Q3284.64 1050.0 3284.64 562.0Q3284.64 497.0 3275.64 432.0H2578.64Q2578.64 210.0 2904.64 210.0Q3063.64 210.0 3222.64 240.0V30.0Q3083.64 0.0 2884.64 0.0Q2313.64 0.0 2313.64 537.0Q2313.64 1050.0 2806.64 1050.0ZM2578.64 616.0H3026.64V624.0Q3026.64 842.0 2806.64 842.0Q2596.64 842.0 2578.64 616.0Z M3676.96 1430.0V0.0H3411.96V1430.0Z M4120.280000000001 1430.0V0.0H3855.28V1430.0Z M4423.6 0.0V1211.0H4273.6V1320.0L4688.6 1460.0V0.0Z M5519.92 220.0Q5871.92 220.0 5871.92 719.0Q5871.92 1210.0 5519.92 1210.0Q5156.92 1210.0 5156.92 719.0Q5156.92 220.0 5519.92 220.0ZM4881.92 713.0Q4881.92 1440.0 5519.92 1440.0Q6146.92 1440.0 6146.92 713.0Q6146.92 -10.0 5519.92 -10.0Q4881.92 -10.0 4881.92 713.0Z M6415.24 0.0V1211.0H6265.24V1320.0L6680.24 1460.0V0.0Z" fill={color} />
      </g>
    </svg>
  );
}
