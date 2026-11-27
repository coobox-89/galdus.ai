import React, { useEffect, useMemo, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

// Original illustration: a Viking warrior in a snowy forest whose raised arm turns into
// a lime digital lattice. Pure SVG + canvas so it stays sharp and animatable.

const S = { x: 600, y: 575 };          // shoulder
const F = { x: 772, y: 205 };          // fist centre
const ARM = 'M548 548 C585 500 640 470 668 430 L708 330 C718 300 726 275 735 252 L812 262 C800 300 790 330 778 365 L738 470 C715 530 690 580 650 640 Z';
const FIST = 'M728 248 L736 176 C738 160 752 150 768 150 L806 152 C822 154 832 166 830 182 L822 262 C820 276 808 284 794 283 L742 278 C732 276 727 262 728 248 Z';

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function pine(x, base, h, w) {
  // Four stacked triangles with a snow cap on each tier.
  const tiers = 4;
  let d = '';
  let snow = '';
  for (let i = 0; i < tiers; i++) {
    const top = base - h + (h * i) / (tiers + .6);
    const bot = base - h + (h * (i + 1.35)) / (tiers + .2);
    const half = (w / 2) * ((i + 1.2) / tiers);
    d += `M${x} ${top} L${x + half} ${bot} L${x - half} ${bot} Z `;
    snow += `M${x} ${top} L${x + half * .55} ${top + (bot - top) * .5} L${x + half * .2} ${top + (bot - top) * .42} L${x} ${top + (bot - top) * .55} L${x - half * .3} ${top + (bot - top) * .4} L${x - half * .55} ${top + (bot - top) * .5} Z `;
  }
  d += `M${x - w * .04} ${base} h${w * .08} v-${h * .12} h-${w * .08} Z`;
  return { d, snow };
}

function forest(seed, count, minX, maxX, base, hMin, hMax) {
  const r = seeded(seed);
  return Array.from({ length: count }, () => {
    const h = hMin + r() * (hMax - hMin);
    return pine(minX + r() * (maxX - minX), base + r() * 30, h, h * (.42 + r() * .12));
  });
}

function Snow({ reduce }) {
  const ref = useRef(null);
  useEffect(() => {
    if (reduce) return undefined;
    const c = ref.current;
    const ctx = c.getContext('2d');
    let raf;
    const flakes = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 2.2, s: .2 + Math.random() * .8, d: Math.random() * 6 }));
    const resize = () => { c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio; };
    resize();
    window.addEventListener('resize', resize);
    const tick = t => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const f of flakes) {
        f.y += f.s * .0016; f.x += Math.sin(t / 1600 + f.d) * .0004;
        if (f.y > 1.02) { f.y = -.02; f.x = Math.random(); }
        ctx.globalAlpha = .35 + f.r / 5;
        ctx.fillStyle = f.r > 2 ? '#E9F6C9' : '#F8FAFC';
        ctx.beginPath(); ctx.arc(f.x * c.width, f.y * c.height, f.r * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [reduce]);
  return <canvas ref={ref} className="snow" aria-hidden="true" />;
}

export function VikingScene() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const far = { x: useTransform(sx, v => v * -8), y: useTransform(sy, v => v * -4) };
  const mid = { x: useTransform(sx, v => v * -16), y: useTransform(sy, v => v * -8) };
  const hero = { x: useTransform(sx, v => v * 14), y: useTransform(sy, v => v * 8) };
  const near = { x: useTransform(sx, v => v * 34), y: useTransform(sy, v => v * 14) };

  useEffect(() => {
    if (reduce) return undefined;
    const on = e => { mx.set(e.clientX / window.innerWidth - .5); my.set(e.clientY / window.innerHeight - .5); };
    window.addEventListener('pointermove', on);
    return () => window.removeEventListener('pointermove', on);
  }, [mx, my, reduce]);

  const farTrees = useMemo(() => forest(7, 38, -40, 1340, 640, 160, 260), []);
  const midTrees = useMemo(() => forest(19, 22, -60, 1360, 720, 260, 400), []);
  const pixels = useMemo(() => {
    const r = seeded(42);
    const ax = F.x - S.x, ay = F.y - S.y;
    return Array.from({ length: 90 }, (_, i) => {
      const t = .32 + r() * .78;                  // position along the arm (0 shoulder, 1 fist)
      const spread = (r() - .5) * (90 - t * 30) + (t > .95 ? (r() - .5) * 60 : 0);
      const nx = -ay / Math.hypot(ax, ay), ny = ax / Math.hypot(ax, ay);
      const size = 4 + Math.floor(r() * 3) * 3;
      const drift = r() > .6;                     // some pixels float away from the arm
      return { x: S.x + ax * t + nx * spread, y: S.y + ay * t + ny * spread, size, delay: r() * 4, dur: 1.4 + r() * 2.4,
        dx: drift ? 20 + r() * 50 : 0, dy: drift ? -20 - r() * 60 : 0, key: i };
    });
  }, []);
  const lattice = useMemo(() => {
    const lines = [];
    for (let i = -40; i < 40; i++) lines.push(`M${520 + i * 13} 120 l300 520`);     // along-ish
    for (let i = -30; i < 50; i++) lines.push(`M480 ${100 + i * 13} l420 -170`);   // across
    return lines.join(' ');
  }, []);

  const intro = reduce ? {} : { initial: { opacity: 0, scale: 1.08, filter: 'blur(10px)' }, animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    transition: { duration: 1.6, ease: [0.16, 1, 0.3, 1] } };

  return (
    <motion.div className="viking" aria-hidden="true" {...intro}>
      <svg viewBox="0 0 1300 1000" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="v-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#07152E" /><stop offset=".55" stopColor="#173A63" /><stop offset=".72" stopColor="#3C6A8E" /><stop offset="1" stopColor="#0B1F3B" />
          </linearGradient>
          <radialGradient id="v-moon" cx=".72" cy=".22" r=".35"><stop offset="0" stopColor="#E4FF6B" stopOpacity=".28" /><stop offset="1" stopColor="#E4FF6B" stopOpacity="0" /></radialGradient>
          <linearGradient id="v-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C9DAEA" stopOpacity="0" /><stop offset=".5" stopColor="#C9DAEA" stopOpacity=".35" /><stop offset="1" stopColor="#C9DAEA" stopOpacity="0" /></linearGradient>
          <linearGradient id="v-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#DCE7F2" /><stop offset="1" stopColor="#7E9AB8" /></linearGradient>
          <linearGradient id="v-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F0BC98" /><stop offset=".6" stopColor="#D08E6B" /><stop offset="1" stopColor="#9C5E44" /></linearGradient>
          <linearGradient id="v-skin-arm" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#B5704F" /><stop offset=".5" stopColor="#E6A983" /><stop offset="1" stopColor="#C98A66" /></linearGradient>
          <linearGradient id="v-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E6EEF6" /><stop offset=".35" stopColor="#9FB0C3" /><stop offset=".7" stopColor="#56677D" /><stop offset="1" stopColor="#2B3647" /></linearGradient>
          <linearGradient id="v-fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9A8070" /><stop offset=".45" stopColor="#5A463A" /><stop offset="1" stopColor="#1E1714" /></linearGradient>
          <linearGradient id="v-beard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D27A3A" /><stop offset=".55" stopColor="#9B4A1E" /><stop offset="1" stopColor="#5C2A10" /></linearGradient>
          <linearGradient id="v-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#B3622C" /><stop offset="1" stopColor="#4E230D" /></linearGradient>
          <linearGradient id="v-mail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5D6E85" /><stop offset="1" stopColor="#1C2738" /></linearGradient>
          <linearGradient id="v-lime" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3FD47A" /><stop offset=".45" stopColor="#B6FF00" /><stop offset="1" stopColor="#E4FF6B" /></linearGradient>
          <linearGradient id="v-armfade" gradientUnits="userSpaceOnUse" x1={S.x} y1={S.y} x2={F.x} y2={F.y}>
            <stop offset="0" stopColor="#fff" /><stop offset=".34" stopColor="#fff" /><stop offset=".62" stopColor="#000" />
          </linearGradient>
          <linearGradient id="v-wirefade" gradientUnits="userSpaceOnUse" x1={S.x} y1={S.y} x2={F.x} y2={F.y}>
            <stop offset="0" stopColor="#000" /><stop offset=".3" stopColor="#000" /><stop offset=".58" stopColor="#fff" />
          </linearGradient>
          <mask id="v-flesh"><rect width="1300" height="1000" fill="url(#v-armfade)" /></mask>
          <mask id="v-wire"><rect width="1300" height="1000" fill="url(#v-wirefade)" /></mask>
          <clipPath id="v-armclip"><path d={ARM} /><path d={FIST} /></clipPath>
          <radialGradient id="v-glow"><stop offset="0" stopColor="#B6FF00" stopOpacity=".55" /><stop offset="1" stopColor="#B6FF00" stopOpacity="0" /></radialGradient>
          <pattern id="v-mailp" width="12" height="10" patternUnits="userSpaceOnUse"><path d="M0 5 a6 5 0 0 1 12 0" fill="none" stroke="#8FA2BA" strokeOpacity=".35" strokeWidth="1.4" /></pattern>
          <linearGradient id="v-fade-b" x1="0" y1="0" x2="0" y2="1"><stop offset=".72" stopColor="#0B1F3B" stopOpacity="0" /><stop offset="1" stopColor="#0B1F3B" /></linearGradient>
          <linearGradient id="v-fade-r" x1="0" y1="0" x2="1" y2="0"><stop offset=".7" stopColor="#0B1F3B" stopOpacity="0" /><stop offset="1" stopColor="#0B1F3B" /></linearGradient>
        </defs>

        <rect width="1300" height="1000" fill="url(#v-sky)" />
        <rect width="1300" height="1000" fill="url(#v-moon)" />

        <motion.g style={far}>
          {farTrees.map((t, i) => <g key={i}><path d={t.d} fill="#1B3B60" /><path d={t.snow} fill="#C9DAEA" opacity=".55" /></g>)}
          <rect y="560" width="1300" height="200" fill="url(#v-mist)" />
        </motion.g>
        <motion.g style={mid}>
          {midTrees.map((t, i) => <g key={i}><path d={t.d} fill="#0E2747" /><path d={t.snow} fill="#E3ECF5" opacity=".8" /></g>)}
          <path d="M-40 760 C200 720 420 750 640 735 C900 720 1100 745 1340 725 L1340 1000 L-40 1000 Z" fill="url(#v-ground)" opacity=".55" />
        </motion.g>

        <motion.g style={hero}>
          <g transform="translate(1385 18) scale(-1.12 1.12)">
          <motion.g animate={reduce ? undefined : { scale: [1, 1.012, 1] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '430px 900px' }}>
            {/* long hair behind */}
            <path d="M300 290 C270 390 272 520 300 640 L560 640 C590 520 586 390 552 290 Z" fill="url(#v-hair)" />
            {/* torso, mail and fur cloak */}
            <path d="M270 640 C300 600 360 585 430 585 C500 585 560 600 600 640 L640 1000 L230 1000 Z" fill="url(#v-mail)" />
            <path d="M270 640 C300 600 360 585 430 585 C500 585 560 600 600 640 L640 1000 L230 1000 Z" fill="url(#v-mailp)" />
            <path d="M120 1000 L150 760 L132 730 L180 700 L170 660 L230 640 L240 600 L300 610 L320 575 L360 600 L400 570 L430 600 L470 570 L505 600 L545 575 L565 612 L622 600 L640 642 L690 660 L682 705 L728 730 L708 760 L740 1000 Z" fill="url(#v-fur)" />
            <path d="M190 700 l14 -26 M250 650 l10 -24 M330 600 l8 -22 M520 604 l10 -22 M600 630 l14 -20 M660 690 l16 -18" stroke="#C9B3A2" strokeWidth="3" strokeLinecap="round" opacity=".55" />
            {/* neck */}
            <path d="M372 520 L470 520 L482 600 L360 600 Z" fill="#B06E50" />
            {/* face */}
            <path d="M338 268 L502 268 L520 352 L505 432 L470 478 L372 478 L336 432 L322 352 Z" fill="url(#v-skin)" />
            <path d="M338 268 L372 268 L360 360 L372 478 L336 432 L322 352 Z" fill="#8F5239" opacity=".35" />
            <path d="M478 300 L502 268 L520 352 L505 432 L470 478 Z" fill="#7C432D" opacity=".28" />
            {/* nose */}
            <path d="M412 330 L434 330 L446 398 L424 408 L400 398 Z" fill="#C27F5E" />
            <path d="M434 330 L446 398 L424 408 Z" fill="#8A4F38" opacity=".5" />
            {/* lime war paint across the eyes */}
            <motion.path d="M318 316 L344 309 L372 314 L398 308 L430 313 L460 307 L492 313 L522 308 L526 324 L520 346 L494 352 L462 348 L432 354 L400 349 L370 355 L340 350 L322 354 L316 334 Z"
              fill="url(#v-lime)" opacity=".92" animate={reduce ? undefined : { opacity: [.85, 1, .85] }} transition={{ duration: 2.4, repeat: Infinity }} />
            {/* brows, furious */}
            <path d="M342 312 L404 326 L410 316 L350 296 Z" fill="#4A230F" />
            <path d="M500 312 L438 326 L432 316 L492 296 Z" fill="#4A230F" />
            {/* eyes */}
            <path d="M356 330 L392 336 L384 344 L360 342 Z" fill="#0B1F3B" />
            <path d="M486 330 L450 336 L458 344 L482 342 Z" fill="#0B1F3B" />
            <motion.g animate={reduce ? undefined : { opacity: [0, 1, 0] }} transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 1.2 }}>
              <circle cx="374" cy="338" r="3.2" fill="#E4FF6B" /><circle cx="468" cy="338" r="3.2" fill="#E4FF6B" />
              <circle cx="374" cy="338" r="12" fill="url(#v-glow)" /><circle cx="468" cy="338" r="12" fill="url(#v-glow)" />
            </motion.g>
            {/* screaming mouth inside the beard */}
            <motion.g animate={reduce ? undefined : { y: [0, 6, 0], scaleY: [1, 1.08, 1] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
              style={{ transformOrigin: '421px 420px' }}>
              <path d="M330 404 C330 470 340 540 372 600 L392 700 L420 640 L448 700 L470 600 C502 540 512 470 512 404 C490 430 470 438 421 438 C372 438 352 430 330 404 Z M382 448 C402 440 440 440 460 448 L466 486 L421 520 L376 486 Z"
                fill="url(#v-beard)" fillRule="evenodd" />
              <path d="M382 448 C402 440 440 440 460 448 L466 486 L421 520 L376 486 Z" fill="#2A0D08" />
              <path d="M386 452 C404 446 438 446 456 452 L454 464 L388 464 Z" fill="#F3EEE4" />
              <path d="M396 500 C410 490 432 490 446 500 L421 516 Z" fill="#B23A3A" />
              {/* braids with lime rings */}
              <path d="M384 600 l8 100 M458 600 l-8 100" stroke="#7A3816" strokeWidth="16" strokeLinecap="round" />
              <rect x="380" y="640" width="22" height="10" rx="3" fill="url(#v-lime)" /><rect x="440" y="640" width="22" height="10" rx="3" fill="url(#v-lime)" />
              <path d="M360 470 l14 40 M482 470 l-14 40 M398 540 l6 34 M444 540 l-6 34" stroke="#E39A5C" strokeWidth="3" opacity=".5" strokeLinecap="round" />
            </motion.g>
            {/* moustache */}
            <path d="M370 420 C392 408 412 410 421 418 C430 410 450 408 472 420 C460 436 440 436 421 428 C402 436 382 436 370 420 Z" fill="#A9531F" />
            {/* helmet with nasal guard */}
            <path d="M316 292 C316 196 364 140 420 140 C476 140 524 196 524 292 Z" fill="url(#v-steel)" />
            <path d="M420 140 L420 292" stroke="#E6EEF6" strokeOpacity=".5" strokeWidth="5" />
            <path d="M360 170 C380 156 398 150 412 148" stroke="#FFFFFF" strokeOpacity=".7" strokeWidth="6" strokeLinecap="round" fill="none" />
            <rect x="310" y="276" width="220" height="26" rx="4" fill="#4A5B70" />
            {[328, 356, 384, 456, 484, 512].map(x => <circle key={x} cx={x} cy="289" r="4" fill="#C9D6E4" />)}
            <path d="M410 292 L432 292 L428 372 L414 372 Z" fill="url(#v-steel)" />
            <rect x="500" y="238" width="14" height="14" fill="url(#v-lime)" />

            {/* the arm: flesh near the shoulder, lattice and pixels toward the fist */}
            <g mask="url(#v-flesh)">
              <path d={ARM} fill="url(#v-skin-arm)" />
              <path d="M548 548 C585 500 640 470 668 430 L690 440 C660 500 610 560 575 600 Z" fill="#7C432D" opacity=".45" />
              <path d="M640 470 C660 455 680 448 700 452" stroke="#7C432D" strokeWidth="5" fill="none" opacity=".5" strokeLinecap="round" />
              <path d="M690 420 L770 430 L756 470 L676 460 Z" fill="#4A2F22" />
            </g>
            <g mask="url(#v-wire)">
              <path d={ARM} fill="#0B1F3B" fillOpacity=".55" />
              <path d={FIST} fill="#0B1F3B" fillOpacity=".55" />
              <g clipPath="url(#v-armclip)">
                <motion.path d={lattice} stroke="#B6FF00" strokeWidth="1.3" fill="none" opacity=".75"
                  initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, delay: 1.2, ease: 'easeInOut' }} />
                <motion.rect x="420" y="-40" width="560" height="26" fill="url(#v-lime)" opacity=".55"
                  style={{ rotate: -22, transformOrigin: '700px 0px' }}
                  animate={reduce ? undefined : { y: [620, 80] }} transition={{ duration: 2.6, repeat: Infinity, repeatDelay: .8, ease: 'easeInOut' }} />
              </g>
              <path d={ARM} stroke="#B6FF00" strokeWidth="2" fill="none" />
              <path d={FIST} stroke="#B6FF00" strokeWidth="2" fill="none" />
              <path d="M738 196 L824 200 M736 222 L826 226 M734 248 L822 252" stroke="#B6FF00" strokeWidth="1.4" opacity=".7" />
            </g>
            <path d="M520 560 L548 520 L572 540 L590 512 L612 538 L640 520 L652 556 L680 560 L664 600 L690 628 L640 640 L600 620 L560 640 Z" fill="url(#v-fur)" />
            <path d="M560 540 l6 -18 M600 528 l8 -16 M640 545 l12 -14" stroke="#C9B3A2" strokeWidth="3" strokeLinecap="round" opacity=".55" />
            <circle cx={F.x} cy={F.y} r="110" fill="url(#v-glow)" opacity=".7" />
            {pixels.map(p => (
              <motion.rect key={p.key} x={p.x} y={p.y} width={p.size} height={p.size} rx="1" fill={p.size > 8 ? '#E4FF6B' : '#B6FF00'}
                initial={{ opacity: 0 }}
                animate={reduce ? { opacity: .8 } : { opacity: [0, 1, 1, 0], x: [0, 0, p.dx * .4, p.dx], y: [0, 0, p.dy * .4, p.dy] }}
                transition={{ duration: p.dur, delay: 1.4 + p.delay, repeat: Infinity, repeatDelay: p.delay * .5, ease: 'easeOut' }} />
            ))}
          </motion.g>
          </g>
        </motion.g>

        <motion.g style={near}>
          {forest(3, 3, -80, 120, 1010, 520, 640).map((t, i) => <g key={i}><path d={t.d} fill="#061428" /><path d={t.snow} fill="#9FB4CC" opacity=".5" /></g>)}
          {forest(5, 2, 1240, 1380, 1010, 480, 580).map((t, i) => <g key={i}><path d={t.d} fill="#061428" /><path d={t.snow} fill="#9FB4CC" opacity=".5" /></g>)}
        </motion.g>

        <rect width="1300" height="1000" fill="url(#v-fade-b)" />
        <rect width="1300" height="1000" fill="url(#v-fade-r)" />
      </svg>
      <Snow reduce={reduce} />
    </motion.div>
  );
}
