import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

export interface DrumMember {
  name: string;
  handle: string;
  role: string;
  photo: string;
}

// Geometry (px). The camera sits inside the drum: the ring's centre is pushed toward the
// viewer, so the cards in front are seen from inside and the ones at the sides swing
// round to face you, their outer edges bowing closer.
const RADIUS = 560;
const PERSPECTIVE = 700;
const PUSH = 480;
const CARD_W = 268;
const CARD_H = 372;
/** Cards fade out before they swing behind the camera. */
const FADE_FROM = 52;
const FADE_TO = 66;
const AUTO_DEG_PER_S = 5;
const DRAG_DEG_PER_PX = 0.22;
const WHEEL_DEG_PER_PX = 0.09;
/** How quickly queued wheel / key turns are played out (per second); higher is snappier. */
const EASE_RATE = 7;

const norm = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Team portraits on the inside of a slowly turning drum. Drag or scroll to turn it,
 * hover (or tap, or focus) a card to stop it and read the name and role.
 * The team is placed twice round the drum so it stays full; the second copy is hidden
 * from screen readers.
 */
export function TeamDrum({ members }: { members: DrumMember[] }) {
  const cards = [...members, ...members];
  const step = 360 / cards.length;

  const ringRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rot = useRef(0);
  const velocity = useRef(0);
  /** Wheel and arrow-key turns not yet played out; eased in over a few frames. */
  const pending = useRef(0);
  /** Auto-turn speed, eased so hovering slows the drum to a stop instead of freezing it. */
  const autoSpeed = useRef(0);
  const drag = useRef<{ x: number; last: number; t: number; moved: boolean } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  activeRef.current = active;

  // Each card gets its on-screen angle directly, once per frame. (Rotating the ring and
  // placing cards at fixed angles broke hit-testing in Chrome for the two cards that sit
  // at exactly 90° and 270° on the ring, so hover never reached them when they were in front.)
  const paint = useCallback(() => {
    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      const eff = norm(i * step + rot.current);
      const a = Math.abs(eff);
      el.style.transform = `rotateY(${eff}deg) translateZ(${-RADIUS}px)`;
      const o = a <= FADE_FROM ? 1 : a >= FADE_TO ? 0 : 1 - (a - FADE_FROM) / (FADE_TO - FADE_FROM);
      el.style.opacity = String(o);
      el.style.visibility = o === 0 ? 'hidden' : 'visible';
      // Slightly darker toward the edges, for depth.
      el.style.filter = `brightness(${1 - Math.min(a, FADE_TO) / 260})`;
    });
  }, [step]);

  useLayoutEffect(() => paint(), [paint]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const still = reducedMotion();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Queued wheel / key turns ease in rather than jumping.
      const take = pending.current * (1 - Math.exp(-dt * EASE_RATE));
      rot.current += take;
      pending.current -= take;
      if (!drag.current) {
        if (Math.abs(velocity.current) > 0.5) {
          rot.current += velocity.current * dt;
          velocity.current *= Math.pow(0.08, dt); // inertia after a drag or flick
        }
        const target = activeRef.current === null && !still && Math.abs(pending.current) < 0.5 ? AUTO_DEG_PER_S : 0;
        autoSpeed.current += (target - autoSpeed.current) * (1 - Math.exp(-dt * 3));
        rot.current -= autoSpeed.current * dt;
      }
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paint]);

  // Wheel turns the drum. Native listener so it can stop the page from scrolling.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Line-based wheels (Firefox) report in lines; scale them to pixels.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      velocity.current = 0;
      // Cap what can queue up, so a hard fling of the wheel doesn't spin it for seconds.
      pending.current = Math.max(-120, Math.min(120, pending.current - d * WHEEL_DEG_PER_PX));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, last: e.clientX, t: performance.now(), moved: false };
    velocity.current = 0;
    pending.current = 0;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.last;
    if (!d.moved && Math.abs(e.clientX - d.x) > 4) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    const now = performance.now();
    rot.current += dx * DRAG_DEG_PER_PX;
    velocity.current = (dx * DRAG_DEG_PER_PX) / Math.max(0.008, (now - d.t) / 1000);
    d.last = e.clientX;
    d.t = now;
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d?.moved) velocity.current = 0;
    // Clamp the flick so it never spins wildly.
    velocity.current = Math.max(-240, Math.min(240, velocity.current));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    velocity.current = 0;
    pending.current += e.key === 'ArrowLeft' ? step : -step;
  };

  return (
    <div
      ref={stageRef}
      role="group"
      aria-roledescription="carousel"
      aria-label="Team members. Use the arrow keys to turn."
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="team-drum relative h-[380px] cursor-grab touch-pan-y select-none overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 active:cursor-grabbing sm:h-[410px]"
      style={{ perspective: `${PERSPECTIVE}px` }}
    >
      <div ref={ringRef} className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d', transform: `translateZ(${PUSH}px)` }}>
        {cards.map((m, i) => {
          const copy = i >= members.length;
          const on = active === i;
          return (
            <div
              key={`${m.handle}-${i}`}
              ref={(el) => (cardRefs.current[i] = el)}
              aria-hidden={copy || undefined}
              tabIndex={copy ? -1 : 0}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive((a) => (a === i ? null : a))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((a) => (a === i ? null : a))}
              onClick={() => setActive((a) => (a === i ? null : i))}
              className={cn(
                'group absolute overflow-hidden rounded-[14px] border bg-white outline-none transition-[box-shadow,border-color] duration-300 ease-out [backface-visibility:hidden] focus-visible:ring-2 focus-visible:ring-accent-400',
                on
                  ? 'border-accent-400/80 shadow-[0_0_0_1px_rgba(230,148,48,0.55),0_0_34px_2px_rgba(230,148,48,0.42),0_18px_50px_rgba(0,0,0,0.55)]'
                  : 'border-white/10 shadow-[0_18px_50px_rgba(0,0,0,0.55)]',
              )}
              style={{ width: CARD_W, height: CARD_H, marginLeft: -CARD_W / 2, marginTop: -CARD_H / 2 }}
            >
              <img
                src={m.photo}
                alt={copy ? '' : `${m.name}, ${m.role}`}
                draggable={false}
                className={cn('h-full w-full object-cover object-top transition-transform duration-500 ease-out', on && 'scale-[1.04]')}
              />
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-4 pt-14 transition-[opacity,transform] duration-300 ease-out',
                  on ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
                )}
              >
                <p className="text-[19px] font-semibold leading-6 text-white">{m.name}</p>
                <p className="mt-1 text-[14px] leading-5 text-white/80">{m.role}</p>
                <p className="mt-0.5 font-mono text-[12px] text-accent-200/90">{m.handle}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#0b0c0d] to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0b0c0d] to-transparent" aria-hidden />
    </div>
  );
}
