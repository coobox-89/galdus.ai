import React, { useEffect, useMemo, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { BASE } from './paths';

// Full-bleed scene reconstructed from the approved mockup (UI removed), with motion layers
// aligned to the photo in percentages so they stay on the arm at every screen size.

const W = 1672, H = 941;
const ARM = [[670, 470], [750, 400], [890, 420], [930, 560], [920, 700], [1020, 680], [1160, 780], [1180, 840], [1070, 910], [920, 900], [800, 820], [710, 700], [670, 560]];
const STRIPE = [[890, 40], [977, 40], [972, 262], [896, 256]];
const pct = pts => pts.map(([x, y]) => `${(x / W * 100).toFixed(2)}% ${(y / H * 100).toFixed(2)}%`).join(', ');

function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function inside([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

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

  const sparks = useMemo(() => {
    const r = seeded(7), out = [];
    while (out.length < 80) {
      const p = [660 + r() * 530, 390 + r() * 530];
      if (inside(p, ARM)) out.push({ x: p[0] / W * 100, y: p[1] / H * 100, s: 3 + Math.floor(r() * 3) * 2, d: r() * 5, t: 1.2 + r() * 2.4, dx: (r() - .5) * 40, dy: -10 - r() * 40, k: out.length });
    }
    return out;
  }, []);
  const src = n => `${BASE}/hero/plate-${n}.webp`;

  return (
    <div className="hero-bg" aria-hidden="true">
      <motion.div className="plate" style={plate}
        initial={reduce ? false : { opacity: 0, scale: 1.12, filter: 'blur(14px) brightness(.6)' }}
        animate={{ opacity: 1, scale: 1.04, filter: 'blur(0px) brightness(1)' }} transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}>
        <motion.div className="plate-inner" animate={reduce ? undefined : { scale: [1, 1.025, 1] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}>
          <img src={src(1672)} srcSet={`${src(1000)} 1000w, ${src(1672)} 1672w, ${src(2508)} 2508w`} sizes="(max-width: 900px) 200vw, 110vw"
            alt="" fetchPriority="high" draggable="false" />
          {!reduce && <>
            <div className="arm-glow" style={{ clipPath: `polygon(${pct(ARM)})` }} />
            <div className="arm-sweep" style={{ clipPath: `polygon(${pct(ARM)})` }} />
            <div className="paint-sweep" style={{ clipPath: `polygon(${pct(STRIPE)})` }} />
            {sparks.map(p => (
              <motion.i key={p.k} className="spark" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s }}
                initial={{ opacity: 0 }} animate={{ opacity: [0, 1, .9, 0], x: [0, 0, p.dx * .4, p.dx], y: [0, 0, p.dy * .4, p.dy], scale: [.4, 1.2, 1, .6] }}
                transition={{ duration: p.t, delay: 1.8 + p.d, repeat: Infinity, repeatDelay: p.d * .6, ease: 'easeOut' }} />))}
          </>}
        </motion.div>
      </motion.div>
      <motion.div className="hero-fog" style={fog} />
      <Snow reduce={reduce} />
      <div className="hero-shade" />
    </div>
  );
}
