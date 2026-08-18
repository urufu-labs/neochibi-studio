'use client';

/// Wolf mascot — urufu (狼). Ported from launchpad. Deliberately drawn by hand
/// feel: chunky ink line, slightly asymmetric eyes, off-center nose. Reused for
/// cursor, header, empty states, footer.

interface Props {
  size?: number;
  mood?: 'happy' | 'sleepy' | 'confused' | 'gasp';
  className?: string;
}

export function Mascot({ size = 56, mood = 'happy', className }: Props) {
  const eye = mood === 'sleepy' ? '⌢' : mood === 'confused' ? '·' : mood === 'gasp' ? 'o' : '●';
  const mouth = mood === 'sleepy' ? 'zzZ' : mood === 'confused' ? '？' : mood === 'gasp' ? '!!' : 'ᴗ';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <ellipse cx="34" cy="56" rx="18" ry="3" fill="rgba(0,0,0,0.15)" />
      <path
        d="M12 32 C 12 18, 22 10, 32 10 C 42 10, 52 18, 52 32 C 52 44, 44 52, 32 52 C 20 52, 12 44, 12 32 Z"
        fill="#e6d7c2"
        stroke="#3a2c3a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M14 20 L 10 8 L 22 16 Z" fill="#e6d7c2" stroke="#3a2c3a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 21 L 55 10 L 42 17 Z" fill="#e6d7c2" stroke="#3a2c3a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 20 L 12 12 L 18 17 Z" fill="#ffd1dc" />
      <path d="M50 21 L 52 13 L 46 18 Z" fill="#ffd1dc" />
      <text x="24" y="34" textAnchor="middle" fontSize="12" fontFamily="Georgia, serif" fill="#3a2c3a">{eye}</text>
      <text x="41" y="34" textAnchor="middle" fontSize="12" fontFamily="Georgia, serif" fill="#3a2c3a">{eye}</text>
      <ellipse cx="33" cy="40" rx="2.5" ry="1.8" fill="#3a2c3a" />
      <text x="33" y="47" textAnchor="middle" fontSize="9" fontFamily="Georgia, serif" fill="#3a2c3a">{mouth}</text>
      <circle cx="18" cy="40" r="3" fill="rgba(255,136,179,0.5)" />
      <circle cx="47" cy="40" r="3" fill="rgba(255,136,179,0.5)" />
    </svg>
  );
}
