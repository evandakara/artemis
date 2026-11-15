import {
  Activity,
  ArrowUpRight,
  CloudSun,
  Database,
  HeartHandshake,
  MapPin,
  Newspaper,
  Rocket,
  Satellite,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type WheelEvent } from 'react';
import artemisLogo from '@/logo & team/artemis-wordmark-light.png';
import artemisPlaceholder from '@/logo & team/Artemis.jpg';
import evanPhoto from '@/logo & team/Evan.png';
import fadhilPhoto from '@/logo & team/Fadhil.png';
import { cn } from '@/lib/utils';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AboutTab = 'overview' | 'capabilities' | 'team';

const tabs: { id: AboutTab; label: string; number: string }[] = [
  { id: 'overview', label: 'Overview', number: '01' },
  { id: 'capabilities', label: 'Capabilities', number: '02' },
  { id: 'team', label: 'Team', number: '03' },
];

const contributors = [
  { name: 'Fadhil Mauludi', handle: '@fadhilm', role: 'Team owner', photo: fadhilPhoto },
  { name: 'Ellvis Cornelius Setiawan', handle: '@ellviscs', role: 'Contributor', photo: artemisPlaceholder },
  { name: 'Desanda Verdely Yulisar', handle: '@mrpupperfish', role: 'Contributor', photo: artemisPlaceholder },
  { name: 'Evan Dakara Sukatrilaksana', handle: '@evandakara', role: 'Contributor', photo: evanPhoto },
  { name: 'Jonathan Itung', handle: '@jonathanitung', role: 'Contributor', photo: artemisPlaceholder },
  { name: 'Muhammad Syamfiraas Akbar', handle: '@firz', role: 'Contributor', photo: artemisPlaceholder },
];

const capabilities = [
  { icon: Satellite, title: 'Harmonized satellite signals', text: 'MODIS and VIIRS detections are brought onto one comparable Indonesia-wide view.' },
  { icon: CloudSun, title: 'Local fire context', text: 'Weather, wind and haze direction help turn a hotspot into a readable situation.' },
  { icon: Newspaper, title: 'Field intelligence', text: 'Reports and verified sources sit beside the map, ordered for fast scanning.' },
  { icon: HeartHandshake, title: 'Actionable relief', text: 'Each signal can lead to prevention, ground truth, warnings or relief.' },
];

const stats = [
  { icon: Activity, value: '26 yr', label: 'archive view' },
  { icon: MapPin, value: 'ID', label: 'Indonesia focus' },
  { icon: Database, value: 'NASA', label: 'FIRMS source' },
  { icon: Rocket, value: 'MODIS + VIIRS', label: 'live signals' },
];

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
        <header className="relative shrink-0 border-b border-white/[0.08] bg-[radial-gradient(circle_at_10%_0%,rgba(230,148,48,0.18),transparent_38%),#111213] px-5 pb-0 pt-5 sm:px-8 sm:pt-6">
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
          <div role="tablist" aria-label="About Artemis sections" className="mt-6 flex touch-pan-x gap-5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`about-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`about-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveTab(1);
                  }
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveTab(-1);
                  }
                  if (event.key === 'Home') {
                    event.preventDefault();
                    setActiveTab(tabs[0].id);
                  }
                  if (event.key === 'End') {
                    event.preventDefault();
                    setActiveTab(tabs[tabs.length - 1].id);
                  }
                }}
                className={cn(
                  'relative shrink-0 pb-3 font-mono text-[10px] uppercase tracking-[0.13em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
                  activeTab === tab.id ? 'text-accent-200' : 'text-white/40 hover:text-white/75',
                )}
              >
                <span className="mr-2 text-[9px] text-white/25">{tab.number}</span>{tab.label}
                <span className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent-400 transition-transform', activeTab === tab.id ? 'scale-x-100' : 'scale-x-0')} />
              </button>
            ))}
          </div>
        </header>

        <div onWheel={containWheel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
          {activeTab === 'overview' && (
            <div id="about-panel-overview" role="tabpanel" aria-labelledby="about-tab-overview" tabIndex={0} className="animate-fade-in p-5 focus-visible:outline-none sm:p-8">
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="max-w-xl text-sm leading-7 text-white/60">
                    Artemis turns satellite fire detections into a shared picture of what is happening, where it is moving, and what can happen next.
                  </p>
                  <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {stats.map(({ icon: Icon, value, label }) => (
                      <div key={label} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                        <Icon className="h-3.5 w-3.5 text-accent-300" />
                        <div className="mt-4 font-mono text-base font-semibold text-white">{value}</div>
                        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-accent-400/20 bg-[linear-gradient(110deg,rgba(217,131,28,0.12),rgba(158,67,36,0.05))] p-5">
                  <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-accent-300" />
                    <h3 className="text-sm font-semibold text-accent-100">From detection to action</h3>
                  </div>
                  <ol className="mt-5 space-y-4">
                    {['Detect hotspots', 'Add local context', 'Connect response'].map((step, index) => (
                      <li key={step} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-300 text-xs font-bold text-[#17130a]">{String(index + 1).padStart(2, '0')}</span>
                        <span className="text-xs font-medium text-white/70">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-5 text-[10px] text-white/40">
                <span>Built for NASA Space Apps Challenge 2026</span>
                <span>Arek Artemis · Indonesia</span>
              </div>
            </div>
          )}

          {activeTab === 'capabilities' && (
            <div id="about-panel-capabilities" role="tabpanel" aria-labelledby="about-tab-capabilities" tabIndex={0} className="animate-fade-in p-5 focus-visible:outline-none sm:p-8">
              <div className="mb-6">
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent-200/65">The operating picture</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">One signal, more context.</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {capabilities.map(({ icon: Icon, title, text }) => (
                  <article key={title} className="group rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 transition-colors hover:border-accent-300/30 hover:bg-accent-300/[0.045]">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent-300/15 bg-accent-300/[0.08]">
                        <Icon className="h-4 w-4 text-accent-200" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold leading-5 text-white/85">{title}</h4>
                        <p className="mt-2 text-xs leading-5 text-white/45">{text}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div id="about-panel-team" role="tabpanel" aria-labelledby="about-tab-team" tabIndex={0} className="animate-fade-in p-5 focus-visible:outline-none sm:p-8">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent-200/65">People behind the signal</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Artemis Team</h3>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/35">ITS Surabaya</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {contributors.map(({ name, handle, role, photo }) => (
                  <div key={handle} className="group flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-accent-300/30 hover:bg-accent-300/[0.05]">
                    <img src={photo} alt={`${name} profile`} className="h-16 w-16 shrink-0 rounded-xl border border-accent-300/30 object-cover shadow-[0_0_0_3px_rgba(230,148,48,0.06)] transition-transform duration-300 group-hover:scale-[1.03]" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-5 text-white/85">{name}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-white/45">{handle}</span>
                        <span className="h-0.5 w-0.5 rounded-full bg-accent-300/60" />
                        <span className="rounded-full border border-accent-300/15 bg-accent-300/[0.07] px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-accent-200/65">{role}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
