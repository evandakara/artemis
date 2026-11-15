import {
  Activity,
  ArrowUpRight,
  CloudSun,
  Database,
  Globe2,
  HeartHandshake,
  Newspaper,
  Orbit,
  Rocket,
  Satellite,
  Users,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { TeamDrum } from '@/components/about/TeamDrum';
import { useCountUp } from '@/components/impact/useCountUp';

const SatelliteShowcase = lazy(() => import('@/components/landing/ViirsSatellite').then((m) => ({ default: m.SatelliteShowcase })));
import artemisLogo from '@/logo & team/artemis-wordmark-light.png';
import jonathanPhoto from '@/logo & team/Jonathan.png';
import evanPhoto from '@/logo & team/Evan.png';
import fadhilPhoto from '@/logo & team/Fadhil.png';
import ellvisPhoto from '@/logo & team/Ellvis.png';
import desandaPhoto from '@/logo & team/Desanda.png';
import firaasPhoto from '@/logo & team/Firaas.png';
import { cn } from '@/lib/utils';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AboutTab = 'overview' | 'team';

const tabs: { id: AboutTab; label: string; number: string }[] = [
  { id: 'overview', label: 'Overview', number: '01' },
  { id: 'team', label: 'Team', number: '02' },
];

const contributors = [
  { name: 'Fadhil Mauludi', handle: '@fadhilm', role: 'Team owner', photo: fadhilPhoto },
  { name: 'Ellvis Cornelius Setiawan', handle: '@ellviscs', role: 'Contributor', photo: ellvisPhoto },
  { name: 'Desanda Verdely Yulisar', handle: '@mrpupperfish', role: 'Contributor', photo: desandaPhoto },
  { name: 'Evan Dakara Sukatrilaksana', handle: '@evandakara', role: 'Contributor', photo: evanPhoto },
  { name: 'Jonathan Itung', handle: '@jonathanitung', role: 'Contributor', photo: jonathanPhoto },
  { name: 'Muhammad Syamfiraas Akbar', handle: '@firz', role: 'Contributor', photo: firaasPhoto },
];

const capabilities = [
  { icon: Satellite, title: 'Harmonized satellite signals', text: 'MODIS and VIIRS detections are brought onto one comparable Indonesia-wide view.' },
  { icon: CloudSun, title: 'Local fire context', text: 'Weather, wind and haze direction help turn a hotspot into a readable situation.' },
  { icon: Newspaper, title: 'Field intelligence', text: 'Reports and verified sources sit beside the map, ordered for fast scanning.' },
  { icon: HeartHandshake, title: 'Actionable relief', text: 'Each signal can lead to prevention, ground truth, warnings or relief.' },
];

// Numbers from public/data/meta.json: 2000-11 to 2026-11 archive, 7,789,803 detections.
const stats: { icon: typeof Activity; count?: number; decimals?: number; suffix?: string; value?: string; label: string }[] = [
  { icon: Activity, count: 26, suffix: ' yr', label: 'Indonesia archive' },
  { icon: Database, count: 7.79, decimals: 2, suffix: 'M', label: 'detections harmonized' },
  { icon: Globe2, value: 'Global', label: 'live NASA FIRMS' },
  { icon: HeartHandshake, count: 4, label: 'ways to act' },
];

const steps = [
  { title: 'Detect', text: 'MODIS and VIIRS hotspots on one comparable scale.' },
  { title: 'Understand', text: 'Anomaly, season, wind and haze around each fire.' },
  { title: 'Act', text: 'Prevention, ground truth, alerts and relief.' },
];

/** Staggered rise-in: each element gets its own delay through a CSS variable. */
const rise = (i: number): CSSProperties => ({ ['--d' as string]: `${120 + i * 70}ms` });

/**
 * The three ideas of the old intro sentence, set in the wide display face and floating
 * around the satellite. Each drifts on its own slow bob and slides against the pointer by
 * its own depth, so the group reads as layered around the spacecraft.
 */
const ORBIT_PHRASES: { lead: string; key: string; place: string; depth: number; delay: string }[] = [
  { lead: 'What is', key: 'burning', place: 'left-[2%] top-[8%] sm:left-[5%] sm:top-[12%]', depth: 14, delay: '0s' },
  { lead: 'Where the', key: 'smoke goes', place: 'right-[2%] top-[40%] text-right sm:right-[4%]', depth: 24, delay: '-2.3s' },
  { lead: 'What to', key: 'do next', place: 'bottom-[6%] left-[8%] sm:bottom-[9%] sm:left-[14%]', depth: 18, delay: '-4.4s' },
];

function SatelliteHero() {
  const ref = useRef<HTMLDivElement>(null);
  const still = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || still.current) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--mx', '0');
    ref.current?.style.setProperty('--my', '0');
  };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className="about-rise relative -mx-5 -mt-2 h-[300px] overflow-hidden sm:-mx-8 sm:h-[330px]" style={rise(0)}>
      <p className="sr-only">Artemis turns satellite fire detections into a shared picture of what is burning, where the smoke is going, and what you can do next.</p>
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 330" preserveAspectRatio="none">
        <ellipse className="about-orbit" cx="400" cy="170" rx="330" ry="104" fill="none" stroke="rgba(230,148,48,0.28)" strokeWidth="1" strokeDasharray="2 7" transform="rotate(-8 400 170)" />
        <ellipse cx="400" cy="170" rx="250" ry="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" transform="rotate(-8 400 170)" />
      </svg>
      <Suspense fallback={null}>
        <SatelliteShowcase className="absolute inset-0" />
      </Suspense>
      {ORBIT_PHRASES.map((ph) => (
        <div
          key={ph.key}
          aria-hidden
          className={cn('pointer-events-none absolute transition-transform duration-700 ease-out', ph.place)}
          style={{ transform: `translate3d(calc(var(--mx, 0) * ${-ph.depth}px), calc(var(--my, 0) * ${-ph.depth * 0.6}px), 0)` }}
        >
          <span className="about-bob block font-display text-[13px] font-bold uppercase leading-[1.35] tracking-[0.04em] text-white/80 sm:text-[17px]" style={{ animationDelay: ph.delay }}>
            {ph.lead}
            <br />
            <span className="text-accent-300">{ph.key}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function StatValue({ count, decimals = 0, suffix = '', value }: { count?: number; decimals?: number; suffix?: string; value?: string }) {
  const shown = useCountUp(count ?? null, 1100);
  if (count === undefined) return <>{value}</>;
  return (
    <>
      {(shown ?? 0).toFixed(decimals)}
      {suffix}
    </>
  );
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const [show, setShow] = useState(false);
  const [activeTab, setActiveTab] = useState<AboutTab>('overview');

  const containWheel = (event: WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const canScroll = container.scrollHeight > container.clientHeight;
    const atTop = container.scrollTop <= 0 && event.deltaY < 0;
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1 && event.deltaY > 0;

    if (!canScroll || atTop || atBottom) event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    if (!isOpen) {
      setShow(false);
      document.body.style.overflow = '';
      return;
    }

    setActiveTab('overview');
    requestAnimationFrame(() => setShow(true));
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const moveTab = (direction: 1 | -1) => {
    const index = tabs.findIndex((tab) => tab.id === activeTab);
    setActiveTab(tabs[(index + direction + tabs.length) % tabs.length].id);
  };

  if (!isOpen && !show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 bg-[#050505]/80 backdrop-blur-md transition-opacity duration-300',
          show && isOpen ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-artemis-title"
        className={cn(
          'relative flex h-[calc(100vh-1.5rem)] h-[min(760px,calc(100dvh-1.5rem))] max-h-[calc(100vh-1.5rem)] max-h-[min(760px,calc(100dvh-1.5rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-[#0b0c0d] shadow-[0_30px_100px_rgba(0,0,0,0.65)] transition-all duration-300 sm:h-[calc(100vh-3rem)] sm:h-[min(760px,calc(100dvh-3rem))] sm:max-h-[calc(100vh-3rem)] sm:max-h-[min(760px,calc(100dvh-3rem))]',
          show && isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.98] opacity-0',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-white/[0.08] bg-[radial-gradient(circle_at_10%_0%,rgba(230,148,48,0.18),transparent_38%),#111213] px-5 pt-5 sm:px-8 sm:pt-6">
          <button
            onClick={onClose}
            aria-label="Close about Artemis"
            className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/25 p-2 text-white/55 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3 pr-10">
            <img src={artemisLogo} alt="Artemis" width={1200} height={326} className="h-7 w-auto sm:h-8" />
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.2em] text-accent-200/60">SYS / ABOUT</span>
          </div>
          <div className="mt-6 flex items-end justify-between gap-5">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent-200/65">Fire intelligence platform</p>
              <h2 id="about-artemis-title" className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Make the signal useful.</h2>
            </div>
            <span className="mb-1 hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-200/65 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]" /> Online
            </span>
          </div>
          <div role="tablist" aria-label="About Artemis sections" className="about-switch relative mb-5 mt-6 grid h-12 w-full max-w-[24rem] grid-cols-2 rounded-full p-1">
            <span
              aria-hidden
              className="about-switch-thumb absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full"
              style={{ transform: activeTab === 'team' ? 'translateX(100%)' : 'translateX(0)' }}
            />
            {tabs.map((tab) => {
              const Icon = tab.id === 'overview' ? Orbit : Users;
              const on = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`about-tab-${tab.id}`}
                  role="tab"
                  aria-selected={on}
                  aria-controls={`about-panel-${tab.id}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => {
                    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
                      event.preventDefault();
                      moveTab(event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1);
                    }
                    if (event.key === 'Home' || event.key === 'End') {
                      event.preventDefault();
                      setActiveTab(tabs[event.key === 'Home' ? 0 : tabs.length - 1].id);
                    }
                  }}
                  className={cn(
                    'relative z-[1] flex items-center justify-center gap-2 rounded-full font-mono text-[12px] font-bold uppercase tracking-[0.16em] transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300',
                    on ? 'text-[#1c1006]' : 'text-white/55 hover:text-white/90',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </header>

        <div onWheel={containWheel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
          {activeTab === 'overview' && (
            <div id="about-panel-overview" role="tabpanel" aria-labelledby="about-tab-overview" tabIndex={0} className="p-5 focus-visible:outline-none sm:p-8">
              <SatelliteHero />

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {stats.map(({ icon: Icon, label, ...v }, i) => (
                  <div key={label} className="about-rise group rounded-xl border border-white/10 bg-white/[0.025] p-3.5 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-accent-300/30 hover:bg-accent-300/[0.05]" style={rise(1 + i)}>
                    <Icon className="h-4 w-4 text-accent-300 transition-transform duration-300 group-hover:scale-110" />
                    <div className="mt-4 font-mono text-xl font-semibold tabular-nums text-white">
                      <StatValue {...v} />
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">{label}</div>
                  </div>
                ))}
              </div>

              <section className="about-rise mt-8 rounded-xl border border-accent-400/20 bg-[linear-gradient(110deg,rgba(217,131,28,0.12),rgba(158,67,36,0.05))] p-5" style={rise(5)}>
                <div className="flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-accent-300" />
                  <h3 className="text-sm font-semibold text-accent-100">From detection to action</h3>
                </div>
                <ol className="relative mt-5 grid gap-5 sm:grid-cols-3 sm:gap-4">
                  <span className="about-draw absolute left-3.5 right-[30%] top-3.5 hidden h-px bg-gradient-to-r from-accent-300/80 to-accent-300/10 sm:block" aria-hidden />
                  {steps.map((step, index) => (
                    <li key={step.title} className="about-rise relative flex gap-3 sm:block" style={rise(6 + index)}>
                      <span className="about-step relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-300 text-xs font-bold text-[#17130a]" style={{ animationDelay: `${900 + index * 450}ms` }}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="sm:mt-3">
                        <p className="text-sm font-semibold text-white/90">{step.title}</p>
                        <p className="mt-1 text-xs leading-5 text-white/55">{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <div className="about-rise mb-4 mt-8" style={rise(9)}>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent-200/65">The operating picture</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">One signal, more context.</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {capabilities.map(({ icon: Icon, title, text }, i) => (
                  <article key={title} className="about-rise group rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-accent-300/30 hover:bg-accent-300/[0.045]" style={rise(10 + i)}>
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent-300/15 bg-accent-300/[0.08] transition-[box-shadow] duration-300 group-hover:shadow-[0_0_18px_rgba(230,148,48,0.35)]">
                        <Icon className="h-4 w-4 text-accent-200" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold leading-5 text-white/90">{title}</h4>
                        <p className="mt-2 text-xs leading-5 text-white/55">{text}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-5 text-[11px] text-white/45">
                <span>Built for NASA Space Apps Challenge 2026</span>
                <span>ITS Surabaya · Indonesia</span>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div id="about-panel-team" role="tabpanel" aria-labelledby="about-tab-team" tabIndex={0} className="animate-fade-in p-5 focus-visible:outline-none sm:p-8">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent-200/65">People behind the signal</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">The Artemis crew.</h3>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/45">Drag or scroll to turn · hover to pause</span>
              </div>
              <TeamDrum members={contributors} />
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-5">
                <div className="flex items-center gap-2 text-[10px] text-white/40"><Users className="h-3.5 w-3.5" /><span>React · TypeScript · Vite · Leaflet</span></div>
                <a href="https://www.spaceappschallenge.org/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-blue-300/20 bg-blue-300/[0.05] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-blue-100/70 transition-colors hover:border-blue-200/40 hover:bg-blue-300/[0.1] hover:text-blue-100">
                  NASA Space Apps 2026 <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
