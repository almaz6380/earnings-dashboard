import React from 'react';

// Dasselbe Motiv wie das App-Icon: fünf Quellen als Säulen, darüber der Verlauf.
export default function Logo({ size = 30, radius }) {
  const r = radius ?? Math.round(size * 0.29);
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ borderRadius: r, display: 'block', flexShrink: 0 }} aria-hidden="true">
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b222c" /><stop offset="1" stopColor="#0b0e12" />
        </linearGradient>
        <linearGradient id="lg-li" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3fb950" /><stop offset="1" stopColor="#58a6ff" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#lg-bg)" />
      <rect x="176" y="600" width="96" height="220" rx="20" fill="#3987e5" />
      <rect x="312" y="520" width="96" height="300" rx="20" fill="#d95926" />
      <rect x="448" y="440" width="96" height="380" rx="20" fill="#199e70" />
      <rect x="584" y="360" width="96" height="460" rx="20" fill="#c98500" />
      <rect x="720" y="260" width="96" height="560" rx="20" fill="#d55181" />
      <polyline points="160,560 360,480 560,380 760,220 880,160" fill="none" stroke="url(#lg-li)"
        strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="880" cy="160" r="40" fill="#ffffff" />
    </svg>
  );
}
