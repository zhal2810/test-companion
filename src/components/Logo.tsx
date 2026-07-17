interface LogoProps {
  className?: string;
}

/**
 * Logo aplikasi (mark saja, tanpa teks) — sama persis dengan public/favicon.svg,
 * tapi versi inline React supaya tetap tajam di ukuran berapa pun dan warnanya
 * ikut palet Tailwind yang sama dipakai di header (emerald/teal).
 */
export default function Logo({ className = 'w-8 h-8' }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logoBgGrad)" />
      {/* Trend / growth line */}
      <path d="M11 40 L24 27 L32 35 L53 14" stroke="#ECFDF5" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M42 14 L53 14 L53 25" stroke="#ECFDF5" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Coin */}
      <circle cx="16" cy="49" r="7.5" fill="#FDE68A" stroke="#B45309" strokeWidth="2" />
      <text x="16" y="52.5" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700" fill="#92400E" textAnchor="middle">$</text>
    </svg>
  );
}