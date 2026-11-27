import React, { useEffect, useMemo, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { BASE } from './paths';

// Sign-in hero: the warrior artwork (from the approved mockup) layered over an animated
// snowy mountain forest. Everything around the photo is code, so it moves and scales.

const W = 655, H = 941;  // source crop size, used for percentage coordinates
const ARM = [[70, 470], [150, 400], [290, 420], [330, 560], [320, 700], [420, 680], [560, 780], [580, 840], [470, 910], [320, 900], [200, 820], [110, 700], [70, 560]];
const STRIPE = [[290, 40], [377, 40], [372, 262], [296, 256]];
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

function pine(x, base, h, w) {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const top = base - h + (h * i) / 5.6;
    const bot = base - h + (h * (i + 1.5)) / 5.2;
    const half = (w / 2) * ((i + 1.4) / 5);
    d += `M${x} ${top} L${x + half} ${bot} L${x - half} ${bot} Z `;
  }
  return d;
}

function Snow({ reduce }) {
  const ref = useRef(null);
  useEffect(() => {
    if (reduce) return undefined;
    const c = ref.current, ctx = c.getContext('2d');
    let raf;
    const flakes = Array.from({ length: 180 }, () => ({ x: Math.random(), y: Math.random(), r: .5 + Math.random() * 2.4, s: .15 + Math.random() * .75, d: Math.random() * 6 }));
    const resize = () => { c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio; };
    resize(); window.addEventListener('resize', resize);
    const tick = t => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const f of flakes) {
        f.y += f.s * .0015; f.x += Math.sin(t / 1700 + f.d) * .00045;
        if (f.y > 1.02) { f.y = -.02; f.x = Math.random(); }
        ctx.globalAlpha = .25 + f.r / 5; ctx.fillStyle = '#F8FAFC';
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
  const sx = useSpring(mx, { stiffness: 50, damping: 18 }), sy = useSpring(my, { stiffness: 50, damping: 18 });
  const layer = k => ({ x: useTransform(sx, v => v * k), y: useTransform(sy, v => v * k * .4) });  // eslint-disable-line react-hooks/rules-of-hooks
  const far = layer(-10), mid = layer(-22), warrior = layer(16), fog = layer(30);
  useEffect(() => {
    if (reduce) return undefined;
    const on = e => { mx.set(e.clientX / window.innerWidth - .5); my.set(e.clientY / window.innerHeight - .5); };
    window.addEventListener('pointermove', on);
    return () => window.removeEventListener('pointermove', on);
  }, [mx, my, reduce]);

  const trees = useMemo(() => {
    const r = seeded(11);
    return { far: Array.from({ length: 40 }, () => pine(r() * 1700 - 50, 760 + r() * 40, 220 + r() * 160, 110 + r() * 60)).join(' '),
      near: Array.from({ length: 16 }, () => pine(r() * 1700 - 50, 1010, 420 + r() * 260, 190 + r() * 80)).join(' ') };
  }, []);
  const sparks = useMemo(() => {
    const r = seeded(7), out = [];
    while (out.length < 70) {
      const p = [60 + r() * 530, 390 + r() * 530];
      if (inside(p, ARM)) out.push({ x: p[0] / W * 100, y: p[1] / H * 100, s: 3 + Math.floor(r() * 3) * 2, d: r() * 5, t: 1.2 + r() * 2.4, dx: (r() - .5) * 40, dy: -10 - r() * 40, k: out.length });
    }
    return out;
  }, []);

  return (
    <div className="hero-bg" aria-hidden="true">
      <motion.div className="hero-photo-blur" style={{ backgroundImage: `url(${BASE}/hero/warrior-sm.webp)` }}
        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} />
      <svg className="hero-land" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="hb-mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E6EEF6" /><stop offset=".35" stopColor="#8DA3BD" /><stop offset="1" stopColor="#2A4566" stopOpacity="0" /></linearGradient>
          <linearGradient id="hb-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C8D6E5" stopOpacity="0" /><stop offset=".5" stopColor="#C8D6E5" stopOpacity=".28" /><stop offset="1" stopColor="#C8D6E5" stopOpacity="0" /></linearGradient>
        </defs>
        <motion.g style={far}>
          <path d="M900 640 L1080 300 L1150 380 L1240 220 L1330 330 L1400 260 L1520 420 L1640 360 L1640 700 L900 700 Z" fill="url(#hb-mtn)" opacity=".55" />
          <path d="M-40 620 L120 380 L220 470 L320 330 L440 520 L520 470 L640 640 Z" fill="url(#hb-mtn)" opacity=".28" />
          <path d={trees.far} fill="#16314F" opacity=".7" />
          <rect y="560" width="1600" height="260" fill="url(#hb-fog)" />
        </motion.g>
        <motion.g style={mid}><path d={trees.near} fill="#081A33" opacity=".85" /></motion.g>
      </svg>

      <motion.div className="hero-warrior-wrap" style={warrior}>
        <motion.div className="hero-warrior"
          initial={reduce ? false : { opacity: 0, y: 60, scale: 1.06, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: .2 }}>
          <motion.img src={`${BASE}/hero/warrior.webp`} alt="" fetchPriority="high" draggable="false"
            animate={reduce ? undefined : { scale: [1, 1.025, 1] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
          {!reduce && <>
            <div className="arm-glow" style={{ clipPath: `polygon(${pct(ARM)})` }} />
            <div className="arm-sweep" style={{ clipPath: `polygon(${pct(ARM)})` }} />
            <div className="paint-sweep" style={{ clipPath: `polygon(${pct(STRIPE)})` }} />
            {sparks.map(p => (
              <motion.i key={p.k} className="spark" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s }}
                initial={{ opacity: 0 }} animate={{ opacity: [0, 1, .9, 0], x: [0, 0, p.dx * .4, p.dx], y: [0, 0, p.dy * .4, p.dy], scale: [.4, 1.2, 1, .6] }}
                transition={{ duration: p.t, delay: 1.6 + p.d, repeat: Infinity, repeatDelay: p.d * .6, ease: 'easeOut' }} />))}
          </>}
        </motion.div>
      </motion.div>

      <motion.div className="hero-fog" style={fog} />
      <Snow reduce={reduce} />
      <div className="hero-shade" />
    </div>
  );
}
