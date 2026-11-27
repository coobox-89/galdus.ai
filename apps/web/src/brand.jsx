import React from 'react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';

// The Galdus mark: a chamfered G completed by a single lime "pixel".
const G_PATH = 'M28 0H100V28H28V72H44V47H72V100H28L0 72V28Z';

export function Mark({ size = 36, animate = false, mono = false, delay = 0, interactive = true }) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;
  const [scope, run] = useAnimate();
  const busy = React.useRef(false);

  // Hover: the G re-draws itself and the pixel jumps out and snaps back in.
  async function hover() {
    if (!interactive || reduce || busy.current) return;
    busy.current = true;
    try {
      await Promise.all([
        run('path', { pathLength: [0.15, 1], fillOpacity: [0.25, 1] }, { duration: 0.7, ease: [0.65, 0, 0.35, 1] }),
        run('.px', { x: [0, 20, 0], y: [0, -29, 0], rotate: [0, 180, 360] }, { duration: 0.75, ease: [0.34, 1.56, 0.64, 1] }),
        run('.glow', { opacity: [0, 0.9, 0], scale: [0.6, 1.4, 1.6] }, { duration: 0.8 }),
      ]);
    } finally { busy.current = false; }
  }

  return (
    <svg ref={scope} width={size} height={size} viewBox="-4 -4 108 108" role="img" aria-label="Galdus.ai"
      onMouseEnter={hover} style={{ overflow: 'visible', cursor: interactive ? 'pointer' : undefined }}>
      <defs>
        <linearGradient id="gm-px" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E4FF6B" /><stop offset=".5" stopColor="#B6FF00" /><stop offset="1" stopColor="#3FD47A" /></linearGradient>
        <linearGradient id="gm-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#DCE6F4" /></linearGradient>
        <radialGradient id="gm-glow"><stop offset="0" stopColor="#B6FF00" stopOpacity=".7" /><stop offset="1" stopColor="#B6FF00" stopOpacity="0" /></radialGradient>
      </defs>
      <motion.circle className="glow" cx="86" cy="60" r="34" fill="url(#gm-glow)" initial={{ opacity: 0 }} style={{ originX: '86px', originY: '60px' }} />
      <motion.path
        d={G_PATH}
        fill={mono ? 'currentColor' : 'url(#gm-g)'}
        stroke="#F8FAFC"
        strokeWidth={2}
        strokeLinejoin="round"
        initial={play ? { pathLength: 0, fillOpacity: 0 } : false}
        animate={{ pathLength: 1, fillOpacity: 1 }}
        transition={{ pathLength: { duration: 1.1, delay, ease: [0.65, 0, 0.35, 1] }, fillOpacity: { duration: .35, delay: delay + .95 } }}
      />
      <motion.g className="px" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        initial={play ? { x: 68, y: -77, opacity: 0, rotate: 90 } : false}
        animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: delay + 1.15 }}>
        <rect x="72" y="47" width="28" height="25" rx="2" fill={mono ? 'currentColor' : 'url(#gm-px)'} />
      </motion.g>
    </svg>
  );
}

export function Aurora() {
  return <div className="aurora" aria-hidden="true"><i /><i /><i /></div>;
}

export function Wordmark() {
  return <span className="wordmark">Galdus<i>.ai</i></span>;
}

// Organic brand shape from the identity artwork, used once on the landing page.
export function Swoosh({ style, flip = false }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg className="swoosh" style={style} viewBox="0 0 600 600" aria-hidden="true"
      initial={reduce ? false : { opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}>
      <defs>
        <linearGradient id={flip ? 'sw2' : 'sw1'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D8FF4D" />
          <stop offset=".45" stopColor="#B6FF00" />
          <stop offset="1" stopColor="#0E5C3A" />
        </linearGradient>
      </defs>
      <motion.path
        d={flip ? 'M600 120C470 150 360 260 330 400C305 520 380 590 600 600Z' : 'M0 0H420C300 40 190 120 120 260C70 360 40 470 0 600Z'}
        fill={`url(#${flip ? 'sw2' : 'sw1'})`}
        animate={reduce ? undefined : { d: flip
          ? ['M600 120C470 150 360 260 330 400C305 520 380 590 600 600Z', 'M600 90C450 140 350 250 340 390C330 520 400 590 600 600Z', 'M600 120C470 150 360 260 330 400C305 520 380 590 600 600Z']
          : ['M0 0H420C300 40 190 120 120 260C70 360 40 470 0 600Z', 'M0 0H450C320 60 210 140 150 270C100 380 50 480 0 600Z', 'M0 0H420C300 40 190 120 120 260C70 360 40 470 0 600Z'] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.svg>
  );
}
