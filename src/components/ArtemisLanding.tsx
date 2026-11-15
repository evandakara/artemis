import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CloudSun, HeartHandshake, Newspaper, Satellite, ShieldCheck } from 'lucide-react';

import { FeaturePreviews, SectionRule, TelemetryStrip, TuningPanel } from '@/components/LandingExtras';
import { DEFAULT_EARTH, type EarthTuning } from '@/components/landing/earthTuning';
import { EmberField } from '@/components/landing/EmberField';
import { LandingAtmosphere } from '@/components/landing/LandingAtmosphere';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroStars } from '@/components/landing/HeroStars';
import { cn } from '@/lib/utils';
import { useInView } from '@/lib/useInView';
import { fetchHistoryMeta, type HistoryMeta } from '@/data/historyApi';
import { FIRE_CAMPAIGNS } from '@/data/fireCampaigns';

// three.js is large: load the globe as its own chunk after first paint.
const EarthHero = lazy(() => import('@/components/landing/EarthHero'));
const ViirsSatellite = lazy(() => import('@/components/landing/ViirsSatellite'));

/** If WebGL is unavailable or the globe fails, keep the page: render nothing in its place. */
class GlobeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('Landing globe disabled:', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface ArtemisLandingProps {
  onEnterConsole: () => void;
  onOpenAbout: () => void;
  onOpen: (path: string) => void;
  news?: ReactNode;
}

const solutionCards = [
  { icon: Satellite, title: 'Signals arrive fragmented', description: 'Artemis combines MODIS and VIIRS observations into one comparable 26-year record of fire activity.' },
  { icon: CloudSun, title: 'Hotspots lack context', description: 'Select a hotspot to see its 20-year history, current wind, and where its smoke will drift.' },
  { icon: Newspaper, title: 'Response information is scattered', description: 'Satellite signals, field reports and wildfire news sit side by side, so teams see the same picture.' },
  { icon: HeartHandshake, title: 'Relief access is difficult to find', description: 'Every hotspot leads to an action: prevention funds, ground truth, haze warnings or verified relief campaigns.' },
];

/**
 * Three facts that back each problem card. Numbers come from the processed archive
 * (meta.json) and the hand-checked campaign list; nothing is estimated here.
 */
function solutionFacts(index: number, meta: HistoryMeta | null): { value: string; label: string }[] {
  const years = meta ? `${meta.range.years[0]}–${meta.range.years[1]}` : '2000–2026';
  const span = meta ? meta.range.years[1] - meta.range.years[0] : 26;
  const detections = meta ? `${(meta.totals.detections / 1e6).toFixed(2)}M` : '…';
  const sensors = meta ? Object.keys(meta.sensors).length : null;
  const verified = FIRE_CAMPAIGNS.filter((c) => c.verified);
  const countries = new Set(verified.map((c) => c.country)).size;
  switch (index) {
    case 0:
      return [
        { value: years, label: 'One harmonized record across both sensor generations' },
        { value: detections, label: 'Satellite fire detections processed from NASA FIRMS' },
        { value: sensors ? String(sensors) : '…', label: 'Satellite sensor records (MODIS and VIIRS) merged onto one MODIS-equivalent scale' },
      ];
    case 1:
      return [
        { value: '~5 km²', label: 'Archive cell behind every hotspot you click' },
        { value: `${span} yrs`, label: 'Of burn history for that cell, month by month' },
        { value: 'Live', label: 'Wind and a downwind haze cone for the spot' },
      ];
    case 2:
      return [
        { value: 'NRT', label: 'The last 24 hours of FIRMS detections beside the archive' },
        { value: meta ? meta.staticMask.sources.toLocaleString('en-US') : '…', label: 'Static heat sources (flares, kilns) masked out' },
        { value: '1 map', label: 'Detections, news and alerts in the same view' },
      ];
    default:
      return [
        { value: String(verified.length), label: 'Fire groups verified by Artemis, each with a source' },
        { value: String(countries), label: 'Countries where a verified group is listed' },
        { value: '4', label: 'Actions per hotspot: fund, verify, warn, report' },
      ];
  }
}

/** Counts the number in a fact up from zero when it appears ("3.12M", "~5 km²"); other values show as they are. */
function CountUp({ value }: { value: string }) {
  const m = /^([^\d]*)(\d[\d,]*(?:\.\d+)?)([^\d]*)$/.exec(value);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!m || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    const [, pre, num, post] = m;
    const target = Number(num.replace(/,/g, ''));
    const decimals = num.includes('.') ? num.split('.')[1].length : 0;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = target * eased;
      setShown(`${pre}${decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US')}${post}`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{shown}</>;
}

const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-[6px] bg-accent-500 px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.1em] text-karhutla-ink shadow-[0_10px_30px_-10px_rgba(158,67,36,0.6)] transition-colors hover:bg-accent-400';
const secondaryBtnDark =
  'inline-flex items-center justify-center gap-2 rounded-[6px] border border-white/25 px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:border-white/60 hover:bg-white/[0.06]';

export function ArtemisLanding({ onEnterConsole, onOpenAbout, onOpen, news }: ArtemisLandingProps) {
  const [activeSolution, setActiveSolution] = useState(0);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [earth, setEarth] = useState<EarthTuning>(DEFAULT_EARTH);
  const tuning = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tune');
  const onCount = useCallback((n: number) => setLiveCount(n), []);
  const selected = solutionCards[activeSolution];
  const rootRef = useRef<HTMLDivElement>(null);
  // Replays the fact count-up each time the panel scrolls back into view.
  const facts = useInView<HTMLDListElement>(0.3, { repeat: true });
  const [meta, setMeta] = useState<HistoryMeta | null>(null);
  useEffect(() => {
    fetchHistoryMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  // Scroll choreography (GSAP + ScrollTrigger + SplitText) loads as its own chunk once
  // fonts are ready, so line splits match the final type. Content is fully visible
  // without it; reduced motion skips it entirely (handled inside initLandingMotion).
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    Promise.all([import('@/components/landing/landingMotion'), document.fonts?.ready])
      .then(([m]) => {
        if (!cancelled && rootRef.current) cleanup = m.initLandingMotion(rootRef.current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    // overflow-x-clip (not overflow-hidden): clips sideways bleed without breaking the sticky header.
    <div ref={rootRef} className="min-h-screen overflow-x-clip bg-karhutla-paper text-neutral-900">
      <LandingHeader onEnterConsole={onEnterConsole} onOpenAbout={onOpenAbout} onOpen={onOpen} />

      <main>
        {/* Orbit hero: a dark stage, the live count of today's detections, and the Earth rising
            as a huge spinning horizon with every fire burning on it as neon pixels. */}
        {/* Pulled up under the sticky header (-mt/pt of its height) so the space backdrop and
            stars run behind the translucent bar instead of the paper background. */}
        <section data-hero className="hero-orbit relative isolate -mt-[4.25rem] flex min-h-[100svh] flex-col overflow-hidden pt-[4.25rem] text-white">
          <HeroStars />
          <div className="relative z-[2] mx-auto flex w-full max-w-[1440px] flex-1 flex-col items-center px-5 pb-[30vh] pt-10 text-center sm:px-8 sm:pt-12 lg:pb-[31vh]">
            <h1 className="font-display text-[clamp(1.85rem,4.4vw,4.6rem)] font-bold leading-[1.06] [text-shadow:0_2px_24px_#070504]">
              <span data-split-hero className="block">Wildfire signals are everywhere.</span>
              <span data-hero-sweep className="display-sweep-ember mt-2 block">Clarity is not.</span>
            </h1>
            {/* Set like the command center's readouts: JetBrains Mono, tight and technical. */}
            <p data-hero-fade className="mt-6 max-w-[46rem] font-mono text-[13px] leading-6 tracking-[0.01em] text-white/70 [text-shadow:0_1px_12px_#070504] sm:text-[14px] sm:leading-[1.7]">
              <span className="text-accent-300">&gt;</span> Originating from Indonesia&rsquo;s fire crisis, Artemis is growing into a global fire
              intelligence system: live NASA fire detections worldwide, twenty-six years of Indonesian records on one scale,
              and an action anyone can take for every hotspot.
            </p>
            <div data-hero-fade className="mt-7 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <button onClick={onEnterConsole} className={cn(primaryBtn, 'cta-glow')}>
                Launch command center <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => onOpen('/audit')} className={secondaryBtnDark}>
                <ShieldCheck className="h-4 w-4" /> Enterprise EUDR audit
              </button>
            </div>

            {/* The live count, sitting on the horizon. */}
            <div data-hero-fade className="mt-auto pt-10" aria-live="polite">
              <div className="flex items-center justify-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-400">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                Fire detections · last 24 h
              </div>
              <div className="mt-2 font-mono text-[clamp(2.1rem,3.4vw,3.1rem)] font-semibold leading-none tabular-nums tracking-[-0.04em] text-white">
                {liveCount === null ? <span className="text-white/35">——</span> : liveCount.toLocaleString('en-US')}
              </div>
              <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-white/70 [text-shadow:0_1px_10px_#070504,0_0_4px_#070504]">
                NASA FIRMS · MODIS + VIIRS · each neon pixel is one detection
              </div>
            </div>
          </div>

          {/* The 3D moment. Outer div positions, inner divs animate (intro rise, scroll hand-off). */}
          {/* data-html2canvas-ignore: the liquid-glass snapshot must never touch this canvas. html2canvas calls
              getContext('2d') on canvases it clones, which would lock it and stop WebGL from starting. */}
          <div aria-hidden data-html2canvas-ignore className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[62vh] min-h-[340px]">
            <div data-earth className="absolute inset-0 will-change-transform">
              <div data-earth-intro className="absolute inset-0">
                <GlobeBoundary>
                  <Suspense fallback={null}>
                    <EarthHero tuning={earth} onCount={onCount} />
                  </Suspense>
                </GlobeBoundary>
                {/* The VIIRS carrier orbiting the Earth: a taller canvas (globe height / 0.62) on top of the
                    globe with the same camera, so the satellite passes behind the real globe and never clips. */}
                <div className="absolute inset-x-0 bottom-0 h-[161.3%]">
                  <GlobeBoundary>
                    <Suspense fallback={null}>
                      <ViirsSatellite />
                    </Suspense>
                  </GlobeBoundary>
                </div>
              </div>
            </div>
          </div>
        </section>

        <TelemetryStrip />
        <FeaturePreviews onOpen={onOpen} />

        <section id="solutions" data-header-tone="light" className="flow-solves grain relative scroll-mt-[4.25rem]">
          <div data-heat aria-hidden className="pointer-events-none absolute inset-0 opacity-0" style={{ background: 'radial-gradient(70% 40% at 30% 100%, rgba(230,148,48,0.7), transparent 70%)' }} />
          <div className="relative z-[2] mx-auto max-w-[1440px] px-5 pb-28 pt-14 sm:px-8 lg:pb-36 lg:pt-20">
            <SectionRule index="03" label="What Artemis solves" />
            <div className="mb-8 mt-10">
              <h2 data-split className="mt-3 max-w-4xl font-display text-2xl font-bold leading-[1.15] text-neutral-950 sm:text-4xl">A connected picture for wildfire response</h2>
            </div>
            <div data-reveal className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="grid gap-px overflow-hidden rounded-[6px] border border-neutral-900/15 bg-neutral-900/15 sm:grid-cols-2">
                {solutionCards.map(({ icon: Icon, title }, index) => (
                  <button
                    key={title}
                    onClick={() => setActiveSolution(index)}
                    aria-pressed={activeSolution === index}
                    className={cn('group relative min-h-32 overflow-hidden p-5 text-left transition-colors', activeSolution === index ? 'bg-white' : 'bg-karhutla-paper hover:bg-white/70')}
                  >
                    {/* Ember bar that grows across the selected card. */}
                    <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px] origin-left bg-gradient-to-r from-accent-500 to-karhutla-rust transition-transform duration-500', activeSolution === index ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-[0.25]')} />
                    <Icon className={cn('h-5 w-5 transition-transform duration-300 group-hover:-translate-y-0.5', activeSolution === index ? 'text-accent-700' : 'text-neutral-600 group-hover:text-neutral-900')} />
                    <h3 className="mt-5 font-semibold text-neutral-900">{title}</h3>
                    <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-600">
                      {activeSolution === index ? 'Selected' : 'Explore'}
                    </span>
                  </button>
                ))}
              </div>
              {/* Hex-cell field (Artemis' ~5 km² archive grid) over deep ember, with the facts that back each problem. */}
              <div
                className="hex-field grain relative overflow-hidden rounded-[6px] text-white"
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty('--px', `${((e.clientX - r.left) / r.width) * 100}%`);
                  e.currentTarget.style.setProperty('--py', `${((e.clientY - r.top) / r.height) * 100}%`);
                }}
                onPointerLeave={(e) => {
                  e.currentTarget.style.setProperty('--px', '-60%');
                  e.currentTarget.style.setProperty('--py', '-60%');
                }}
              >
                <div className="relative z-[2] flex h-full flex-col justify-between gap-8 p-6 sm:p-8">
                  <div>
                    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-200">Why it matters</div>
                    <h3 key={selected.title} className="tab-panel-in mt-3 font-display text-lg font-bold leading-snug text-white sm:text-xl">{selected.title}</h3>
                    <p key={`${selected.title}-d`} className="tab-panel-in mt-3 max-w-xl text-sm leading-7 text-white/80">{selected.description}</p>
                  </div>
                  <dl ref={facts.ref} key={`${selected.title}-f-${facts.inView}`} className="tab-panel-in grid gap-2 sm:grid-cols-3">
                    {solutionFacts(activeSolution, meta).map((f) => (
                      <div key={f.label} className="rounded-[4px] border border-white/10 bg-karhutla-smoke/55 p-3.5 backdrop-blur-sm">
                        <dt className="sr-only">{f.label}</dt>
                        <dd className="font-display text-lg font-bold tabular-nums text-accent-200 sm:text-xl"><CountUp value={f.value} /></dd>
                        <dd className="mt-1.5 text-xs leading-5 text-white/75">{f.label}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </section>

        {news && (
          <section id="news" data-header-tone="light" data-header-tone-split="0.5" aria-labelledby="field-reporting" className="flow-news grain relative scroll-mt-[4.25rem] overflow-hidden text-white">
            <EmberField sparks={false} className="z-[1]" />
            {/* Feathers the grain and plumes into the footer's smoke, so the seam is a gradient, not a line. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-28 bg-gradient-to-b from-transparent to-karhutla-smoke" />
            <div className="relative z-[2] mx-auto max-w-[1440px] px-5 pb-20 pt-16 sm:px-8 lg:pb-28 lg:pt-20">
              <SectionRule index="04" label="Field reporting" />
              <div className="mb-8 mt-10">
                <h2 data-split id="field-reporting" className="mt-3 font-display text-2xl font-bold text-karhutla-smoke sm:text-4xl">Wildfire news</h2>
              </div>
              <div data-reveal>{news}</div>
            </div>
          </section>
        )}
      </main>

      <LandingFooter onEnterConsole={onEnterConsole} onOpenAbout={onOpenAbout} onOpen={onOpen} />

      {/* Embers from the footer up to section 02, and the smoke that follows the cursor. */}
      <LandingAtmosphere />

      {tuning && <TuningPanel earth={earth} onEarth={setEarth} />}
    </div>
  );
}
