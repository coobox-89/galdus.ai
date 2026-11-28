// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Copy, X } from 'lucide-react';

// Shared frame for every setup wizard: same look as the model connect wizard.
export function WizardFrame({ icon, title, subtitle, steps, step, onClose, footer, children, wide }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const on = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return createPortal(
    <motion.div className="wz-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className={`wz ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="wzk-title"
        initial={reduce ? false : { opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: .98 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
        <header className="wz-head">
          <div className="wz-title"><span className="wz-plug">{icon}</span>
            <div><h2 id="wzk-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
          <button type="button" className="wz-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <ol className="wz-steps" aria-label="Progress" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
          {steps.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="dot">{i < step ? <CheckCircle2 size={14} /> : i + 1}</span><span className="lbl">{s}</span>
            </li>))}
        </ol>
        <div className="wz-body"><AnimatePresence mode="wait">
          <motion.div key={step} initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -24 }} transition={{ duration: .22 }}>
            {children}
          </motion.div>
        </AnimatePresence></div>
        <footer className="wz-foot">{footer}</footer>
      </motion.div>
    </motion.div>, document.body);
}

export function Done({ title, children }) {
  const reduce = useReducedMotion();
  return (
    <div className="wz-done">
      <motion.div className="wz-burst" initial={reduce ? false : { scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
        <CheckCircle2 size={56} /></motion.div>
      <h3>{title}</h3>{children}
    </div>
  );
}

export function CopyField({ label, value, toast }) {
  return (
    <div className="copyfield"><small>{label}</small>
      <div><code>{value}</code><button type="button" className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(value); toast?.('Copied.'); }}><Copy size={14} /> Copy</button></div>
    </div>
  );
}

export function HowTo({ steps }) {
  return <ol className="wz-howto">{steps.map((s, i) => <li key={i}><span>{i + 1}</span><div>{s}</div></li>)}</ol>;
}
