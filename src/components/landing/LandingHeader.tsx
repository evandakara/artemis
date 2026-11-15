// Landing header: wordmark left, centred uppercase section links, the glowing
// "Command center" pill on the right. Sticky.
//
// Over the hero it is a solid dark bar. Once the hero has scrolled away it turns
// transparent (a faint blur only) and adapts its ink to what is underneath: white over
// dark surfaces, dark ink over the light paper sections. The tone is sampled under the
// bar on scroll: the first ancestor with an opaque background colour decides (cards,
// ticker, footer); otherwise the section's data-header-tone ("light" | "dark", with an
// optional data-header-tone-split: below that fraction of the section's height the tone
// flips, for sections that burn from orange into smoke).
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';

import artemisWordmarkLight from '@/logo & team/artemis-wordmark-light.png';
import artemisWordmarkInk from '@/logo & team/artemis-wordmark-ink.png';
import { cn } from '@/lib/utils';

interface Props {
  onEnterConsole: () => void;
  onOpenAbout: () => void;
  onOpen: (path: string) => void;
}

type Mode = 'solid' | 'over-light' | 'over-dark';

/** Smooth-scrolls to a landing section by id (Lenis follows native smooth scrolling). */
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** "light" or "dark" for what is drawn at (x, y), or null if nothing tells. */
function toneAt(x: number, y: number): 'light' | 'dark' | null {
  let el = document.elementFromPoint(x, y) as HTMLElement | null;
  while (el && el !== document.body) {
    const bg = getComputedStyle(el).backgroundColor;
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(bg);
    if (m && (m[4] === undefined || Number(m[4]) >= 0.5)) {
      const lum = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
      return lum > 0.55 ? 'light' : 'dark';
    }
    const tone = el.dataset.headerTone;
    if (tone === 'light' || tone === 'dark') {
      const split = Number(el.dataset.headerToneSplit);
      if (split > 0) {
        const r = el.getBoundingClientRect();
        if ((y - r.top) / r.height > split) return tone === 'light' ? 'dark' : 'light';
      }
      return tone;
    }
    el = el.parentElement;
  }
  return null;
}

const NAV_BASE = 'rounded-[4px] px-2 py-2 text-[12px] font-medium uppercase tracking-[0.2em] transition-colors duration-300';

export function LandingHeader({ onEnterConsole, onOpenAbout, onOpen }: Props) {
  const headerRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>('solid');
  const [menuOpen, setMenuOpen] = useState(false);

  const links: { label: string; go: () => void }[] = [
    { label: 'Platform', go: () => scrollToSection('platform') },
    { label: 'Solutions', go: () => scrollToSection('solutions') },
    { label: 'News', go: () => scrollToSection('news') },
    { label: 'EUDR audit', go: () => onOpen('/audit') },
    { label: 'About', go: onOpenAbout },
  ];

  // Solid over the hero; transparent with adaptive ink below it.
  // Runs straight from the scroll event (throttled to ~16 updates/s with a trailing call),
  // not from requestAnimationFrame, so it also keeps up when frames are throttled.
  useEffect(() => {
    let last = 0;
    let trailing = 0;
    const update = () => {
      last = performance.now();
      const header = headerRef.current;
      if (!header) return;
      const h = header.getBoundingClientRect().height;
      const hero = document.querySelector('[data-hero]');
      if (hero && hero.getBoundingClientRect().bottom > h) {
        setMode('solid');
        return;
      }
      const y = h + 4;
      const votes = [0.12, 0.5, 0.88].map((f) => toneAt(window.innerWidth * f, y));
      const light = votes.filter((v) => v === 'light').length;
      const dark = votes.filter((v) => v === 'dark').length;
      setMode(light > dark ? 'over-light' : 'over-dark');
    };
    const schedule = () => {
      window.clearTimeout(trailing);
      if (performance.now() - last > 60) update();
      trailing = window.setTimeout(update, 80);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.clearTimeout(trailing);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const inkLight = mode !== 'over-light';
  const navCls = cn(NAV_BASE, inkLight ? 'text-white/65 hover:text-white' : 'text-karhutla-smoke/70 hover:text-karhutla-smoke');

  return (
    <header
      ref={headerRef}
      data-mode={mode}
      className={cn(
        'sticky top-0 z-30 border-b transition-[background-color,border-color] duration-300',
        mode === 'solid' ? 'border-white/[0.08] bg-[#070504]/90 backdrop-blur-xl' : 'border-transparent bg-transparent backdrop-blur-[3px]',
      )}
    >
      <div className="mx-auto grid h-[4.25rem] max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-4 px-5 sm:px-8">
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="relative flex items-center" aria-label="Artemis, back to top">
          {/* Both wordmarks are stacked and cross-fade with the tone underneath. */}
          <img src={artemisWordmarkLight} alt="Artemis" width={1200} height={326} className={cn('h-8 w-auto transition-opacity duration-300 sm:h-9', !inkLight && 'opacity-0')} />
          <img src={artemisWordmarkInk} alt="" aria-hidden width={1200} height={326} className={cn('absolute left-0 top-1/2 h-8 w-auto -translate-y-1/2 transition-opacity duration-300 sm:h-9', inkLight && 'opacity-0')} />
        </button>

        <nav aria-label="Main" className="hidden items-center justify-center gap-5 lg:flex xl:gap-9">
          {links.map((l) => (
            <button key={l.label} type="button" onClick={l.go} className={navCls}>
              {l.label}
            </button>
          ))}
        </nav>

        <div className="col-start-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onEnterConsole}
            className="cta-glow inline-flex items-center gap-2 rounded-full bg-accent-500 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-karhutla-smoke transition-colors hover:bg-accent-400 sm:px-6"
          >
            <span className="hidden sm:inline">Command center</span>
            <span className="sm:hidden">Console</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {/* Section links on screens too narrow for the centre nav. */}
          <div className="relative lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className={cn('flex h-10 w-10 items-center justify-center rounded-full transition-colors', inkLight ? 'text-white/80 hover:text-white' : 'text-karhutla-smoke/80 hover:text-karhutla-smoke')}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {menuOpen && (
              <nav aria-label="Sections" className="tab-panel-in fixed right-4 top-[4.6rem] w-[min(15rem,calc(100vw-2rem))] rounded-[10px] border border-white/10 bg-[#120c0a]/95 p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                {links.map((l) => (
                  <button
                    key={l.label}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      l.go();
                    }}
                    className="flex w-full rounded-[6px] px-3 py-2.5 text-left text-[12px] uppercase tracking-[0.14em] text-white/80 hover:bg-white/[0.06] hover:text-white"
                  >
                    {l.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
