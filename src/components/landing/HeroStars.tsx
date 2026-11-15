// Faint stars in the black space of the orbit hero. Each one brightens and dims slowly on
// its own cycle (6–14 s). Placed with a fixed seed, so the sky is the same on every visit.
// Sits behind the Earth and satellite canvases, so the opaque globe hides any star "behind"
// it. Plain CSS: under reduced motion the stars stay still at a soft constant brightness.
import { useMemo } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  peak: number;
  duration: number;
  delay: number;
  warm: boolean;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function HeroStars({ count = 150 }: { count?: number }) {
  const stars = useMemo<Star[]>(() => {
    const r = seeded(20261115);
    return Array.from({ length: count }, () => {
      const big = r() > 0.9;
      return {
        x: r() * 100,
        // Denser toward the top; the lower sky is mostly covered by the Earth.
        y: Math.pow(r(), 1.35) * 92,
        size: big ? 2 + r() * 0.8 : 1 + r() * 0.6,
        peak: big ? 0.75 + r() * 0.2 : 0.35 + r() * 0.35,
        duration: 6 + r() * 8,
        delay: -r() * 14,
        warm: r() > 0.72,
      };
    });
  }, [count]);

  return (
    <div aria-hidden data-html2canvas-ignore className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="hero-star absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: s.warm ? '#ffd9a8' : '#f4ede6',
            boxShadow: s.size > 1.8 ? `0 0 ${s.size * 3}px ${s.warm ? 'rgba(255,190,120,0.55)' : 'rgba(255,245,235,0.5)'}` : undefined,
            ['--star-peak' as string]: s.peak,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
