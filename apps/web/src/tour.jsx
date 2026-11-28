// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, BookOpen, Bot, Check, Cpu, LayoutDashboard, MessageSquare, UserCog, Workflow, X } from 'lucide-react';
import { useWs } from './workspace';

// First-run guided tour. Seven short steps that point at the navigation; the state (completed or
// skipped) is saved on the account, so it is shown once per person, not once per browser.
// Keyboard: Tab stays inside the panel, Left/Right move, Esc skips. Replay it from Account.
export const STEPS = [
  { id: 'home', icon: LayoutDashboard, title: 'Welcome to Galdus',
    body: 'Home is your starting point: what is set up, what is missing and shortcuts to the next step. This tour takes about a minute.' },
  { id: 'models', icon: Cpu, title: 'Connect a model',
    body: 'Galdus works with the AI provider you choose. In Models, pick one, paste your API key and test it: the wizard tells you where to get the key. Keys are stored encrypted.' },
  { id: 'chat', icon: MessageSquare, title: 'Chat',
    body: 'Ask anything and watch the answer stream in. Choose a persona, attach files or images, and ground a chat on a knowledge collection to get answers with sources.' },
  { id: 'knowledge', icon: BookOpen, title: 'Knowledge',
    body: 'Upload documents, import web pages or files from Google Drive and SharePoint. Galdus indexes them so chats and agents can cite them.' },
  { id: 'agents', icon: Bot, title: 'Agents',
    body: 'An agent is a reusable assistant: instructions, a model, optional knowledge and tools such as web fetch, calculator or your MCP servers. Run it and review every step.' },
  { id: 'automations', icon: Workflow, title: 'Automations',
    body: 'Run an agent on a schedule or from a webhook, and send the result to Slack, Teams or any URL. Use "Run now" to try it before it goes live.' },
  { id: 'account', icon: UserCog, title: 'Account and security',
    body: 'Set your photo and how Galdus answers you, turn on two-step verification, download your data or sign out everywhere. You can replay this tour from here.' },
];

const Ctx = createContext({ start: () => {} });
export const useTour = () => useContext(Ctx);

export function TourProvider({ go, children }) {
  const ws = useWs();
  const [open, setOpen] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    // Offer it once per session, on the first visit after sign-in, when it is still pending.
    if (!shown.current && ws.user?.onboarding === 'pending' && ws.organizationId) {
      shown.current = true;
      setOpen(true);
    }
  }, [ws.user?.onboarding, ws.organizationId]);

  const save = useCallback(async status => {
    try {
      const r = await ws.call('/v1/auth/onboarding', { method: 'PUT', body: { status } });
      ws.setUser(u => (u ? { ...u, onboarding: r.status } : u));
    } catch (err) { ws.onError(err); }
  }, [ws]);

  const start = useCallback(() => { go('home'); save('pending'); setOpen(true); }, [go, save]);
  const close = useCallback(status => { setOpen(false); save(status); }, [save]);

  return (
    <Ctx.Provider value={{ start }}>
      {children}
      <AnimatePresence>{open && <Tour key="tour" go={go} onClose={close} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

function targetFor(id) {
  // Desktop: the navigation item. Narrow screens hide the sidebar in a drawer: point at the menu button.
  const nav = document.querySelector(`[data-tour="nav-${id}"]`);
  if (nav && nav.getBoundingClientRect().width > 0 && getComputedStyle(nav.closest('.sidebar') || nav).visibility !== 'hidden'
      && nav.getBoundingClientRect().right > 0) return nav;
  const menu = document.querySelector('[data-tour="menu"]');
  return menu && menu.getBoundingClientRect().width > 0 ? menu : null;
}

function Tour({ go, onClose }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const panel = useRef(null);
  const returnFocus = useRef(document.activeElement);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const measure = useCallback(() => {
    const el = targetFor(step.id);
    const r = el?.getBoundingClientRect();
    setRect(r ? { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 } : null);
  }, [step.id]);

  useLayoutEffect(() => { go(step.id); measure(); }, [step.id, go, measure]);
  useEffect(() => {
    const t = setTimeout(measure, 320); // after the page transition
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [measure]);
  useEffect(() => { panel.current?.querySelector('[data-autofocus]')?.focus(); }, [i]);
  useEffect(() => () => { returnFocus.current?.focus?.(); }, []);

  const next = () => (last ? onClose('completed') : setI(n => n + 1));
  const back = () => setI(n => Math.max(0, n - 1));

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose('skipped'); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
    if (e.key !== 'Tab') return;
    // Focus trap: Tab and Shift+Tab cycle through the panel's buttons.
    const items = [...panel.current.querySelectorAll('button:not([disabled])')];
    if (!items.length) return;
    const first = items[0]; const end = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  }

  const Icon = step.icon;
  // Wide screens: the panel sits next to the highlighted item. Narrow screens: a sheet at the bottom (CSS).
  const side = rect && window.innerWidth > 900
    ? { left: rect.left + rect.width + 18, top: Math.max(16, Math.min(rect.top - 24, window.innerHeight - 340)) } : undefined;
  const fade = reduce ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  return (
    <motion.div className="tour" {...fade} transition={{ duration: reduce ? 0 : 0.2 }} onKeyDown={onKeyDown}>
      <div className="tour-shade" aria-hidden="true" onClick={() => panel.current?.querySelector('[data-autofocus]')?.focus()} />
      {rect && <div className="tour-spot" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
      <motion.div ref={panel} className={`tour-panel ${side ? 'beside' : 'center'}`} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        style={side} key={step.id} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.22 }}>
        <div className="tour-top">
          <span className="tour-ic" aria-hidden="true"><Icon size={20} /></span>
          <span className="tour-count">Step {i + 1} of {STEPS.length}</span>
          <button type="button" className="tour-x" data-role="skip" aria-label="Skip the tour" onClick={() => onClose('skipped')}><X size={16} /></button>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        <ol className="tour-dots" aria-hidden="true">{STEPS.map((s, n) => <li key={s.id} className={n === i ? 'on' : n < i ? 'done' : ''} />)}</ol>
        <div className="tour-actions">
          <button type="button" className="btn quiet sm" data-role="skip" onClick={() => onClose('skipped')}>Skip tour</button>
          <span className="tour-grow" />
          <button type="button" className="btn ghost sm" onClick={back} disabled={i === 0}><ArrowLeft size={15} aria-hidden="true" /> Back</button>
          <button type="button" className="btn sm" data-autofocus onClick={next}>
            {last ? <><Check size={15} aria-hidden="true" /> Finish</> : <>Next <ArrowRight size={15} aria-hidden="true" /></>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
