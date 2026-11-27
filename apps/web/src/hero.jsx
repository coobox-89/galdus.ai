import React, { useEffect, useMemo, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
// Imported so Vite fingerprints the file names: a new artwork is never served from an old cache.
import plate1000 from './assets/hero/plate-1000.webp';
import plate1672 from './assets/hero/plate-1672.webp';
import plate2508 from './assets/hero/plate-2508.webp';
import armMask from './assets/hero/arm-mask.png';

// Full-bleed scene reconstructed from the approved mockup (UI removed), with motion layers
// aligned to the photo in percentages so they stay on the arm at every screen size.

const W = 1672, H = 941;
// Mesh nodes on the digital arm, in % of the arm box (traced from the artwork).
const NODES = [[33.39, 68.45], [35.6, 40.82], [45.69, 84.85], [37.8, 81.11], [63.85, 84.31], [16.7, 20.14], [29.17, 69.7], [10.64, 32.44], [83.12, 83.78], [51.56, 84.85], [39.63, 72.19], [9.91, 25.85], [79.45, 85.2], [35.05, 79.14], [13.21, 26.02], [13.39, 25.85], [41.1, 83.6], [51.19, 87.52], [42.57, 76.11], [26.97, 21.03], [13.76, 22.82], [36.33, 73.98], [19.08, 59.18], [31.38, 72.55], [20.0, 63.81], [61.28, 66.31], [32.84, 77.01], [62.2, 64.71], [31.38, 38.86], [78.35, 87.7], [85.87, 81.46], [44.04, 73.26], [36.51, 42.6], [49.72, 82.89], [88.26, 78.97], [33.39, 72.91], [86.79, 83.42], [13.21, 35.29], [54.68, 86.99], [32.29, 21.57], [19.63, 19.96], [61.47, 76.83], [36.88, 62.03], [34.31, 70.77], [63.49, 62.75], [45.14, 66.31], [31.56, 58.65], [22.75, 59.0], [38.17, 75.04], [13.76, 56.86], [55.41, 89.84], [59.63, 83.78], [52.66, 66.13], [65.69, 75.04], [15.23, 36.54], [65.69, 75.4], [20.0, 70.59], [20.37, 65.6], [27.71, 40.11], [66.79, 78.25], [30.28, 75.58], [93.03, 77.72], [57.06, 68.98], [27.34, 18.72], [46.61, 82.0], [14.5, 68.27], [57.98, 91.09], [74.5, 87.52], [51.56, 82.89], [18.35, 72.91]];

function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function Snow({ reduce }) {
  const ref = useRef(null);
  useEffect(() => {
    if (reduce) return undefined;
    const c = ref.current, ctx = c.getContext('2d');
    let raf;
    const flakes = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), r: .5 + Math.random() * 2.3, s: .15 + Math.random() * .75, d: Math.random() * 6 }));
    const resize = () => { c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio; };
    resize(); window.addEventListener('resize', resize);
    const tick = t => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const f of flakes) {
        f.y += f.s * .0015; f.x += Math.sin(t / 1700 + f.d) * .00045;
        if (f.y > 1.02) { f.y = -.02; f.x = Math.random(); }
        ctx.globalAlpha = .2 + f.r / 6; ctx.fillStyle = '#F8FAFC';
        ctx.beginPath(); ctx.arc(f.x * c.width, f.y * c.height, f.r * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [reduce]);
  return <canvas ref={ref} className="hero-snow" aria-hidden="true" />;
}

export function Backdrop() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 45, damping: 18 }), sy = useSpring(my, { stiffness: 45, damping: 18 });
  const plate = { x: useTransform(sx, v => v * -18), y: useTransform(sy, v => v * -10) };
  const fog = { x: useTransform(sx, v => v * 40), y: useTransform(sy, v => v * 12) };
  useEffect(() => {
    if (reduce) return undefined;
    const on = e => { mx.set(e.clientX / window.innerWidth - .5); my.set(e.clientY / window.innerHeight - .5); };
    window.addEventListener('pointermove', on);
    return () => window.removeEventListener('pointermove', on);
  }, [mx, my, reduce]);

  // Nodes of the mesh light up in place; a few motes drift a little, always inside the arm mask.
  const sparks = useMemo(() => {
    const r = seeded(7);
    return NODES.map(([x, y], k) => ({ x, y, k, s: 3 + Math.floor(r() * 3), d: r() * 6, t: 1.6 + r() * 2.2, dx: (r() - .5) * 14, dy: -4 - r() * 14 }));
  }, []);
  const src = n => ({ 1000: plate1000, 1672: plate1672, 2508: plate2508 })[n];

  return (
    <div className="hero-bg" aria-hidden="true">
      <img className="plate-fill" src={src(1000)} alt="" draggable="false" />
      <motion.div className="plate" style={plate}
        initial={reduce ? false : { opacity: 0, scale: 1.12, filter: 'blur(14px) brightness(.6)' }}
        animate={{ opacity: 1, scale: 1.04, filter: 'blur(0px) brightness(1)' }} transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}>
        <motion.div className="plate-inner" animate={reduce ? undefined : { scale: [1, 1.025, 1] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}>
          <img src={src(1672)} srcSet={`${src(1000)} 1000w, ${src(1672)} 1672w, ${src(2508)} 2508w`} sizes="(max-width: 900px) 200vw, 110vw"
            alt="" fetchPriority="high" draggable="false" />
          {!reduce && (
            <div className="arm-fx" style={{ '--am': `url(${armMask})`, '--plate': `url(${src(1672)})` }}>
              <i className="arm-glow" /><i className="arm-sweep" /><i className="arm-pulse" />
              {sparks.map(p => (
                <motion.i key={p.k} className="spark" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s }}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 1, .85, 0], x: [0, 0, p.dx * .5, p.dx], y: [0, 0, p.dy * .5, p.dy], scale: [.5, 1.3, 1, .6] }}
                  transition={{ duration: p.t, delay: 1.8 + p.d, repeat: Infinity, repeatDelay: p.d * .5, ease: 'easeOut' }} />))}
            </div>
          )}
        </motion.div>
      </motion.div>
      <motion.div className="hero-fog" style={fog} />
      <Snow reduce={reduce} />
      <div className="hero-shade" />
    </div>
  );
}
