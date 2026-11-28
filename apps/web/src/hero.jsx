// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

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
// Mesh nodes on the digital arm, in % of the arm box (detected on the HD artwork: bright mesh joints inside arm-mask.png).
const NODES = [[25.69, 65.78], [33.76, 68.63], [27.16, 22.46], [28.62, 62.92], [22.75, 73.98], [23.85, 55.79], [57.61, 84.31], [24.4, 20.32], [37.06, 20.68], [32.66, 22.82], [42.57, 24.96], [51.38, 87.34], [28.07, 69.16], [54.68, 81.82], [28.99, 9.09], [41.1, 81.64], [23.85, 16.22], [21.65, 23.17], [35.23, 70.77], [17.25, 65.6], [42.94, 78.97], [15.41, 62.92], [34.31, 63.28], [28.07, 16.93], [31.56, 18.36], [17.8, 54.55], [25.87, 73.62], [21.1, 18.36], [27.89, 34.94], [39.82, 84.49], [24.95, 29.41], [35.41, 40.64], [27.16, 60.43], [31.38, 63.99], [29.17, 75.58], [44.22, 87.88], [16.15, 19.43], [37.98, 72.73], [26.06, 79.68], [21.28, 59.89], [20.18, 77.01], [23.12, 25.31], [23.67, 70.05], [39.27, 75.04], [43.49, 82.89], [39.27, 40.46], [14.31, 56.86], [55.41, 77.9], [33.76, 25.13], [17.43, 26.74], [20.92, 33.51], [35.96, 59.54], [46.61, 83.07], [21.47, 28.7], [31.38, 38.32], [43.67, 27.81], [22.02, 40.46], [13.21, 60.96], [18.9, 60.96], [14.13, 67.02], [48.44, 79.68], [54.86, 85.38], [33.76, 11.59], [27.52, 19.61], [35.96, 74.87], [60.18, 86.45], [24.22, 37.97], [19.27, 67.2], [60.92, 79.86], [19.27, 44.39]];

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
