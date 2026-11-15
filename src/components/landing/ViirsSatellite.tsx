// Hero satellite: a JPSS / NOAA-20 class spacecraft (the VIIRS carrier), modelled in code
// from NASA's public rendering, recoloured to the KARHUTLA palette. No downloaded assets:
// foil and solar-cell surfaces are drawn on canvases at load. Purely decorative.
//
// It slowly orbits the hero Earth and passes behind it. This canvas sits on top of the
// EarthHero canvas, extended upward, and uses the same camera framing (same fov, position
// and pixel scale, via setViewOffset), so the globe's outline is known in this scene.
// The satellite is never cut by the globe: each frame it is tested as a whole against the
// globe as seen from the camera. In front it draws whole; behind the limb it fades out.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Seen from below and in front, like NASA's rendering: foil plate and dish toward the
// viewer, the solar array reaching away to the left.
const BASE_YAW = 0.95;
// Must match EarthHero: globe radius, centre and camera.
const EARTH_R = 3;
const EARTH_Y = -2.62;
const CAM_Z = 5;
const FOV = 35;
/** EarthHero's canvas is this share of this canvas's height (both bottom-aligned); ArtemisLanding sizes this one at 161.3%. */
const EARTH_SHARE = 0.62;
// Orbit: a ring around the globe's upper cap, tilted a little. It crosses in front of the
// Earth below the live count, then sets behind the globe. One lap every ORBIT_S seconds.
const ORBIT_Y = -0.32;
const ORBIT_R = 2.15;
const ORBIT_TILT = 0.12;
const ORBIT_S = 90;
const SAT_SCALE = 0.21;
const GLOBE = new THREE.Vector3(0, EARTH_Y, 0);
/** Width (world units) of the band past the limb where the satellite fades out. */
const LIMB_FADE = 0.45;
const BASE_PITCH = -0.36;
const BASE_ROLL = 0.05;
/** About modal: the satellite on its own, larger, centred on its bounding box. */
const SHOWCASE_SCALE = 0.72;
const SHOWCASE_CENTRE: [number, number, number] = [-0.45, 0.45, 1.35];

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Crinkled multi-layer insulation, in ember tones. */
function foilTexture(base: [number, number, number], seed: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rand(seed);
  g.fillStyle = `rgb(${base.join(',')})`;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const k = 0.62 + r() * 0.7;
    g.fillStyle = `rgba(${Math.min(255, base[0] * k) | 0},${Math.min(255, base[1] * k) | 0},${Math.min(255, base[2] * k) | 0},0.55)`;
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) g.lineTo(x + (r() - 0.5) * 46, y + (r() - 0.5) * 46);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(255,226,184,0.22)';
  g.lineWidth = 0.7;
  for (let i = 0; i < 90; i++) {
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Solar array: charcoal cells on a copper grid, a few cells warmer than the rest. */
function cellTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d')!;
  const r = rand(7);
  g.fillStyle = '#5a2a1c';
  g.fillRect(0, 0, 512, 192);
  const cols = 16;
  const rows = 6;
  const cw = 512 / cols;
  const ch = 192 / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const v = 18 + r() * 16;
      g.fillStyle = `rgb(${v + 10},${v},${v - 4})`;
      g.fillRect(i * cw + 1.5, j * ch + 1.5, cw - 3, ch - 3);
      if (r() > 0.86) {
        g.fillStyle = 'rgba(230,148,48,0.55)';
        g.fillRect(i * cw + cw / 2 - 2.5, j * ch + ch / 2 - 2.5, 5, 5);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function Env() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.32;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Spacecraft({ reducedMotion, showcase = false }: { reducedMotion: boolean; showcase?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);
  const drift = useRef(0);
  // Start just right of centre, on the front of the ring, heading right.
  const theta = useRef(1.25);
  const fade = useRef(1);
  const [sat, cam, dir, oc] = useMemo(() => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], []);
  const mats = useMemo(() => {
    const foil = foilTexture([217, 131, 28], 3);
    const rust = foilTexture([158, 67, 36], 11);
    const copper = foilTexture([198, 116, 56], 19);
    const cells = cellTexture();
    return {
      foil: new THREE.MeshStandardMaterial({ map: foil, metalness: 0.75, roughness: 0.38, color: '#ffffff' }),
      rust: new THREE.MeshStandardMaterial({ map: rust, metalness: 0.6, roughness: 0.45 }),
      copper: new THREE.MeshStandardMaterial({ map: copper, metalness: 0.65, roughness: 0.42 }),
      bus: new THREE.MeshStandardMaterial({ color: '#7d6d63', metalness: 0.55, roughness: 0.5 }),
      busTop: new THREE.MeshStandardMaterial({ color: '#a39385', metalness: 0.5, roughness: 0.45 }),
      radiator: new THREE.MeshStandardMaterial({ color: '#1f1714', metalness: 0.3, roughness: 0.32 }),
      dish: new THREE.MeshStandardMaterial({ color: '#120c0a', metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide }),
      cream: new THREE.MeshStandardMaterial({ color: '#e9cfa6', metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide }),
      white: new THREE.MeshStandardMaterial({ color: '#efe6dc', metalness: 0.3, roughness: 0.4 }),
      strut: new THREE.MeshStandardMaterial({ color: '#cbbfb3', metalness: 0.7, roughness: 0.35 }),
      cells: new THREE.MeshStandardMaterial({
        map: cells,
        emissiveMap: cells,
        emissive: new THREE.Color('#e69430'),
        emissiveIntensity: 0.18,
        metalness: 0.45,
        roughness: 0.3,
      }),
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
    },
    [mats],
  );

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 2.4);
    const t = state.clock.elapsedTime;
    const px = reducedMotion ? 0 : THREE.MathUtils.clamp(state.pointer.x, -1.5, 1.5);
    const py = reducedMotion ? 0 : THREE.MathUtils.clamp(state.pointer.y, -1.5, 1.5);
    if (showcase) {
      // No orbit: it drifts on a slow yaw swing and leans toward the pointer.
      if (!reducedMotion) drift.current += Math.min(delta, 0.05) * 0.22;
      g.rotation.y += (0.85 + Math.sin(drift.current) * 0.3 + px * 0.5 - g.rotation.y) * k;
      g.rotation.x += (-0.38 - py * 0.3 - g.rotation.x) * k;
      g.rotation.z += (0.12 - px * 0.1 - g.rotation.z) * k;
      g.position.y = reducedMotion ? 0 : Math.sin(t * 0.7) * 0.06;
      return;
    }
    // Full speed in front; up to 3.5x on the far side (sin < 0), so it comes back round sooner.
    const farSide = Math.max(0, -Math.sin(theta.current));
    if (!reducedMotion) theta.current -= ((Math.min(delta, 0.05) * Math.PI * 2) / ORBIT_S) * (1 + 2.5 * farSide);
    const th = theta.current;
    const o = orbit.current;
    if (o) {
      // Ring around the globe's cap: sin(th) > 0 is the near side (in front of the Earth).
      o.position.set(Math.cos(th) * ORBIT_R, ORBIT_Y + Math.sin(th) * ORBIT_R * ORBIT_TILT, Math.sin(th) * ORBIT_R);
    }
    // Turns with the orbit so the far side shows its back, and leans toward the pointer.
    const travel = -Math.cos(th) * 0.55;
    g.rotation.y += (BASE_YAW + travel + px * 0.5 - g.rotation.y) * k;
    g.rotation.x += (BASE_PITCH - py * 0.28 - g.rotation.x) * k;
    g.rotation.z += (BASE_ROLL - px * 0.08 - g.rotation.z) * k;
    g.position.y = reducedMotion ? 0 : Math.sin(t * 0.55) * 0.05;

    // Is the satellite hidden by the globe, seen from the camera? Ray camera → satellite:
    // if it passes through the sphere before reaching the satellite, the satellite is behind.
    // Near the limb the fade is soft, so it slips behind the Earth instead of popping.
    if (o) {
      o.getWorldPosition(sat);
      cam.copy(state.camera.position);
      dir.subVectors(sat, cam);
      const tSat = dir.length();
      dir.divideScalar(tSat);
      oc.subVectors(cam, GLOBE);
      const b = oc.dot(dir);
      const perp = Math.sqrt(Math.max(0, oc.lengthSq() - b * b));
      const tNear = -b - Math.sqrt(Math.max(0, EARTH_R * EARTH_R - perp * perp));
      const behind = perp < EARTH_R + LIMB_FADE && tSat > tNear;
      const target = behind ? THREE.MathUtils.smoothstep(perp, EARTH_R - 0.05, EARTH_R + LIMB_FADE) : 1;
      fade.current += (target - fade.current) * Math.min(1, delta * 8);
      const f = fade.current;
      o.visible = f > 0.01;
      const transparent = f < 0.995;
      for (const m of Object.values(mats)) {
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.opacity = f;
      }
    }
  });

  const box = (args: [number, number, number], pos: [number, number, number], mat: THREE.Material, rot?: [number, number, number]) => (
    <mesh position={pos} rotation={rot} material={mat}>
      <boxGeometry args={args} />
    </mesh>
  );
  const rod = (len: number, pos: [number, number, number], rot: [number, number, number], r = 0.025, mat: THREE.Material = mats.strut) => (
    <mesh position={pos} rotation={rot} material={mat}>
      <cylinderGeometry args={[r, r, len, 10]} />
    </mesh>
  );

  return (
    <group ref={orbit}>
    <group ref={group} scale={showcase ? SHOWCASE_SCALE : SAT_SCALE}>
    <group position={showcase ? SHOWCASE_CENTRE : [0, 0, 0]}>
      {/* Bus */}
      {box([1.85, 0.82, 0.92], [0.42, 0.08, 0], mats.bus)}
      {box([1.75, 0.06, 0.86], [0.46, 0.52, 0], mats.busTop)}
      {/* Radiator panels on the sun-facing side */}
      {box([0.42, 0.62, 0.02], [0.05, 0.08, 0.47], mats.radiator)}
      {box([0.42, 0.62, 0.02], [0.55, 0.08, 0.47], mats.radiator)}
      {box([0.42, 0.62, 0.02], [1.05, 0.08, 0.47], mats.radiator)}
      {/* Gold-foil front plate with the big dish (here in ember foil) */}
      {box([0.14, 1.0, 1.0], [-0.58, 0.04, 0], mats.foil)}
      <mesh position={[-0.66, 0.04, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.dish}>
        <sphereGeometry args={[0.42, 32, 16, 0, Math.PI * 2, 0, 0.9]} />
      </mesh>
      {rod(0.32, [-0.86, 0.04, 0], [0, 0, Math.PI / 2], 0.012, mats.white)}
      {/* Small thrusters on the plate corners */}
      {[[0.42, 0.42], [-0.38, 0.42], [0.42, -0.42], [-0.38, -0.42]].map(([y, z], i) => (
        <mesh key={i} position={[-0.67, y, z]} rotation={[0, 0, Math.PI / 2]} material={mats.copper}>
          <coneGeometry args={[0.035, 0.08, 8]} />
        </mesh>
      ))}
      {/* Top antennas */}
      <mesh position={[1.1, 0.64, -0.2]} material={mats.white}>
        <cylinderGeometry args={[0.07, 0.04, 0.14, 16]} />
      </mesh>
      <mesh position={[1.25, 0.6, 0.25]} material={mats.white}>
        <sphereGeometry args={[0.06, 16, 12]} />
      </mesh>
      {/* Instrument deck underneath: VIIRS, CrIS, ATMS, OMPS, CERES in foil boxes */}
      {box([0.62, 0.36, 0.7], [-0.15, -0.5, 0.02], mats.copper)}
      {box([0.5, 0.42, 0.62], [0.5, -0.52, -0.05], mats.rust)}
      {box([0.66, 0.3, 0.74], [1.12, -0.46, 0.04], mats.copper)}
      {box([0.3, 0.26, 0.34], [0.1, -0.72, 0.28], mats.cream)}
      <mesh position={[0.18, -0.82, -0.12]} rotation={[Math.PI / 2, 0, 0]} material={mats.cream}>
        <cylinderGeometry args={[0.14, 0.14, 0.34, 20]} />
      </mesh>
      {/* Sun shade wedge on the far end */}
      <mesh position={[1.55, -0.62, 0.05]} rotation={[0, 0, -0.32]} material={mats.cream}>
        <planeGeometry args={[0.9, 0.5]} />
      </mesh>
      {box([0.9, 0.04, 0.82], [1.45, -0.72, 0.05], mats.foil, [0, 0, -0.18])}
      {/* Support legs and the deployed boom with a small antenna dish */}
      {rod(0.5, [-0.38, -0.82, 0.25], [0.1, 0, 0.05])}
      {rod(0.5, [0.75, -0.86, 0.22], [0.1, 0, -0.05])}
      {rod(0.55, [-0.05, -1.0, -0.25], [0.35, 0, 0.25])}
      {rod(0.4, [-0.18, -1.38, -0.32], [0, 0, -0.35])}
      <mesh position={[-0.1, -1.6, -0.34]} rotation={[0, 0, 0]} material={mats.white}>
        <cylinderGeometry args={[0.16, 0.04, 0.08, 20]} />
      </mesh>
      <mesh position={[0.6, -1.08, 0.12]} material={mats.dish}>
        <coneGeometry args={[0.18, 0.1, 20, 1, true]} />
      </mesh>
      {/* Solar array: a short boom, then three panels in a row */}
      {/* It leaves the side of the bus next to the foil plate and faces the same way the plate does. */}
      {rod(0.42, [-0.3, -0.3, -0.66], [Math.PI / 2, 0, 0], 0.03)}
      <group position={[-0.32, -0.3, -0.88]} rotation={[0.1, -0.12, 0.06]}>
        {[0, 1, 2].map((i) => (
          <group key={i} position={[0, 0, -0.5 - i * 1.0]}>
            <mesh material={mats.cells} rotation={[0, -Math.PI / 2, 0]}>
              <boxGeometry args={[0.96, 0.84, 0.02]} />
            </mesh>
            {box([0.03, 0.03, 0.96], [0, 0.43, 0], mats.strut)}
            {box([0.03, 0.03, 0.96], [0, -0.43, 0], mats.strut)}
          </group>
        ))}
      </group>
    </group>
    </group>
    </group>
  );
}

/**
 * Camera matching EarthHero's: same fov and position, framed for a canvas EARTH_SHARE as
 * tall, then extended upward with setViewOffset so pixels line up with the globe below.
 */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const h = size.height * EARTH_SHARE;
    camera.fov = FOV;
    camera.position.set(0, 0, CAM_Z);
    camera.aspect = size.width / h;
    camera.setViewOffset(size.width, h, 0, h - size.height, size.width, size.height);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}


/** True while the element is on screen and the tab is visible, so the canvas can pause. */
function useRenderWhileVisible(ref: React.RefObject<HTMLElement>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let onScreen = true;
    const update = () => setVisible(onScreen && document.visibilityState === 'visible');
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      update();
    });
    if (ref.current) io.observe(ref.current);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [ref]);
  return visible;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.25} color="#ffd9b8" />
      {/* Key light from the upper left, fire glow from below, ember rim from behind. */}
      <directionalLight position={[-4, 5, 4]} intensity={1.5} color="#ffe6cc" />
      <directionalLight position={[0.5, -5, 2.5]} intensity={2.1} color="#ff8a3d" />
      <directionalLight position={[3, 1, -4]} intensity={1.2} color="#c67438" />
    </>
  );
}

/** The satellite on its own (About modal): centred, larger, leaning toward the pointer. */
export function SatelliteShowcase({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const visible = useRenderWhileVisible(wrapRef);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  return (
    <div ref={wrapRef} className={className}>
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={Math.min(2, window.devicePixelRatio || 1)}
        camera={{ position: [0, 0, CAM_Z], fov: FOV }}
        gl={{ antialias: true, alpha: true }}
        eventSource={document.body}
        eventPrefix="client"
        aria-hidden
      >
        <Env />
        <Lights />
        <Spacecraft reducedMotion={reducedMotion} showcase />
      </Canvas>
    </div>
  );
}

/** Rendered only on the landing hero; pauses when the hero is off screen or the tab is hidden. */
export default function ViirsSatellite() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const visible = useRenderWhileVisible(wrapRef);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  return (
    <div ref={wrapRef} className="h-full w-full">
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={Math.min(2, window.devicePixelRatio || 1)}
        camera={{ position: [0, 0, CAM_Z], fov: FOV, manual: true }}
        gl={{ antialias: true, alpha: true }}
        eventSource={document.body}
        eventPrefix="client"
        aria-hidden
      >
        <CameraRig />
        <Env />
        <Lights />
        <Spacecraft reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
