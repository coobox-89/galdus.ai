// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, KeyRound, Plug, ShieldCheck, X } from 'lucide-react';
import { GUIDE, ProviderMark } from './providerguide';
import { Combo } from './select';
import { Pixels } from './ui';

const STEPS = ['Provider', 'Get a key', 'Connect', 'Ready'];

// Turn provider errors into something a person can act on.
function explain(check) {
  const t = `${check.error || ''} ${check.message || ''}`.toLowerCase();
  if (/auth|api[- _]?key|401|invalid x-api-key|permission/.test(t)) return { title: 'The key was not accepted', tip: 'Copy the key again from the provider console, without spaces, and check it has not been revoked.' };
  if (/not ?found|404|does not exist|model/.test(t)) return { title: 'The model was not found', tip: 'Pick one of the suggested models or check the exact model name on the provider site.' };
  if (/rate|quota|credit|billing|insufficient|429|402/.test(t)) return { title: 'No credit or too many requests', tip: 'Add credit or enable billing on the provider account, then try again in a minute.' };
  if (/connect|timeout|resolve|unreachable|ssl/.test(t)) return { title: 'The server could not be reached', tip: 'Check the address is public, uses https and is online.' };
  return { title: 'The provider refused the test', tip: 'Check the key, the credit on the account and the model name. You can also save it and test later.' };
}

// Browser window with the provider console and the key row highlighted.
function ConsoleIllo({ id }) {
  const g = GUIDE[id] || {};
  const reduce = useReducedMotion();
  const key = g.self ? 'https://models.example.com/v1' : `${g.prefix || 'key-'}••••••••••••3f9a`;
  return (
    <svg viewBox="0 0 360 190" className="wz-illo" role="img" aria-label={`The key page on ${g.site}`}>
      <defs>
        <linearGradient id="wzWin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#173763" /><stop offset="1" stopColor="#0E2547" /></linearGradient>
        <linearGradient id="wzLime" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E4FF6B" /><stop offset="1" stopColor="#3FD47A" /></linearGradient>
      </defs>
      <rect x="8" y="8" width="344" height="174" rx="14" fill="url(#wzWin)" stroke="rgba(248,250,252,.16)" />
      <circle cx="26" cy="26" r="4" fill="#F55036" opacity=".8" /><circle cx="40" cy="26" r="4" fill="#FFC107" opacity=".8" /><circle cx="54" cy="26" r="4" fill="#3FD47A" opacity=".8" />
      <rect x="70" y="17" width="200" height="18" rx="9" fill="rgba(7,21,48,.8)" />
      <text x="82" y="30" fontSize="10" fill="#B9C7DB" fontFamily="Montserrat, sans-serif">{g.site}</text>
      <rect x="24" y="52" width="70" height="8" rx="4" fill="rgba(248,250,252,.35)" />
      <rect x="24" y="68" width="120" height="6" rx="3" fill="rgba(248,250,252,.15)" />
      <rect x="24" y="80" width="96" height="6" rx="3" fill="rgba(248,250,252,.15)" />
      <motion.rect x="24" y="102" width="312" height="36" rx="10" fill="rgba(182,255,0,.08)" stroke="url(#wzLime)" strokeWidth="1.5"
        initial={reduce ? false : { opacity: .3 }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2.2, repeat: Infinity }} />
      <text x="38" y="125" fontSize="12" fill="#E8F5C8" fontFamily="ui-monospace, monospace">{key}</text>
      <rect x="268" y="110" width="58" height="20" rx="10" fill="url(#wzLime)" />
      <text x="282" y="124" fontSize="10" fontWeight="700" fill="#0B1F3B" fontFamily="Montserrat, sans-serif">Copy</text>
      <rect x="24" y="152" width="90" height="16" rx="8" fill="rgba(248,250,252,.12)" />
      <motion.g initial={reduce ? false : { x: 40, y: 30, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} transition={{ delay: .4, type: 'spring', stiffness: 120, damping: 14 }}>
        <path d="M296 136 l0 22 l6 -6 l5 10 l5 -2 l-5 -10 l8 0 z" fill="#F8FAFC" stroke="#0B1F3B" strokeWidth="1.2" />
      </motion.g>
    </svg>
  );
}

// A key travelling into the Galdus vault.
function KeyIllo({ state }) {
  const reduce = useReducedMotion();
  const ok = state === 'ok', bad = state === 'bad';
  return (
    <svg viewBox="0 0 360 120" className="wz-illo small" role="img" aria-label="Your key is encrypted and stored in your workspace">
      <defs><linearGradient id="wzLime2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E4FF6B" /><stop offset="1" stopColor="#3FD47A" /></linearGradient></defs>
      <rect x="230" y="20" width="96" height="80" rx="16" fill="#0E2547" stroke={bad ? '#F55036' : 'url(#wzLime2)'} strokeWidth="1.5" />
      <path d="M262 36H306V52H262V68H272V60H289V84H262L250 72V48Z" fill="#F8FAFC" transform="translate(4 0) scale(.9)" />
      <rect x="282" y="56" width="16" height="14" rx="1" fill="url(#wzLime2)" />
      <motion.g initial={reduce ? false : { x: -70 }} animate={{ x: state ? 40 : [-70, -10, -70] }}
        transition={state ? { type: 'spring', stiffness: 90, damping: 14 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}>
        <circle cx="96" cy="60" r="16" fill="none" stroke="url(#wzLime2)" strokeWidth="6" />
        <path d="M112 60h70M162 60v12M174 60v9" stroke="url(#wzLime2)" strokeWidth="6" strokeLinecap="round" />
      </motion.g>
      {ok && <motion.circle cx="278" cy="60" r="44" fill="none" stroke="#B6FF00" strokeWidth="2" initial={{ scale: .6, opacity: 1 }} animate={{ scale: 1.4, opacity: 0 }} transition={{ duration: .9 }} style={{ transformOrigin: '278px 60px' }} />}
    </svg>
  );
}

function Stepper({ step }) {
  return (
    <ol className="wz-steps" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
          <span className="dot">{i < step ? <CheckCircle2 size={14} /> : i + 1}</span><span className="lbl">{s}</span>
        </li>))}
    </ol>
  );
}

export function ConnectWizard({ ws, request, onClose }) {
  const reduce = useReducedMotion();
  const providers = ws.sources.providers;
  const [providerId, setProviderId] = useState(request.provider || '');
  const [step, setStep] = useState(request.provider ? 1 : 0);
  const [form, setForm] = useState({ api_key: '', api_base: '', model: request.model || '', label: '' });
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const spec = providers.find(p => p.id === providerId);
  const g = GUIDE[providerId] || {};

  useEffect(() => { if (spec && !form.model) setForm(f => ({ ...f, model: spec.suggestions[0] || '' })); }, [spec]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = e => { if (e.key === 'Escape') onClose(null); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  const prefixWarn = g.prefix && form.api_key && !form.api_key.trim().startsWith(g.prefix);
  const canTest = spec && form.model.trim() && (!spec.requires_key || form.api_key.trim()) && (!spec.requires_base_url || form.api_base.trim());

  async function testAndSave(saveAnyway = false) {
    setBusy(true);
    try {
      const body = { provider: providerId, api_key: form.api_key.trim() || null, api_base: form.api_base.trim() || null, model: form.model.trim() };
      if (!saveAnyway) {
        const r = await ws.call('/v1/models/check', { method: 'POST', body });
        setCheck(r);
        if (!r.ok) return;
      }
      const conn = await ws.call('/v1/models/connections', { method: 'POST', body: {
        provider: providerId, label: form.label.trim() || spec.label.replace(/ \(.*\)$/, ''), api_key: body.api_key, api_base: body.api_base, default_model: body.model } });
      setCreated(conn); setStep(3); ws.refresh();
    } catch (err) { setCheck({ ok: false, error: 'Error', message: err.message }); } finally { setBusy(false); }
  }

  const slide = { initial: reduce ? false : { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: reduce ? undefined : { opacity: 0, x: -24 }, transition: { duration: .22 } };

  return (
    <motion.div className="wz-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(null); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="wz" role="dialog" aria-modal="true" aria-labelledby="wz-title"
        initial={reduce ? false : { opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: .98 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
        <header className="wz-head">
          <div className="wz-title">{spec ? <ProviderMark id={providerId} size={34} /> : <span className="wz-plug"><Plug size={18} /></span>}
            <div><h2 id="wz-title">{spec ? `Connect ${spec.label.replace(/ \(.*\)$/, '')}` : 'Connect a model'}</h2>
              <p>{spec ? g.blurb : 'Pick the provider you want to use. You bring the key, Galdus keeps it encrypted.'}</p></div></div>
          <button type="button" className="wz-x" aria-label="Close" onClick={() => onClose(null)}><X size={18} /></button>
        </header>
        <Stepper step={step} />

        <div className="wz-body">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="s0" {...slide} className="wz-grid">
                {providers.map(p => {
                  const has = ws.sources.connections.some(c => c.provider === p.id);
                  return (
                    <button key={p.id} type="button" className={`wz-card ${providerId === p.id ? 'on' : ''}`}
                      onClick={() => { setProviderId(p.id); setForm(f => ({ ...f, model: p.suggestions[0] || '' })); setCheck(null); setStep(1); }}>
                      <ProviderMark id={p.id} size={30} />
                      <span><b>{p.label.replace(/ \(.*\)$/, '')}</b><small>{GUIDE[p.id]?.blurb}</small></span>
                      {has && <span className="gs-badge ok">Connected</span>}
                    </button>);
                })}
              </motion.div>)}

            {step === 1 && spec && (
              <motion.div key="s1" {...slide} className="wz-split">
                <ConsoleIllo id={providerId} />
                <div className="wz-text">
                  <h3>{g.self ? 'Prepare your server' : `Get your ${spec.label.replace(/ \(.*\)$/, '')} key`}</h3>
                  <ol className="wz-howto">{(g.steps || []).map((s, i) => (
                    <motion.li key={s} initial={reduce ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .1 + i * .08 }}>
                      <span>{i + 1}</span>{s}</motion.li>))}</ol>
                  <p className="wz-note"><ShieldCheck size={15} />{g.cost}</p>
                  {g.url && <a className="btn ghost sm" href={g.url} target="_blank" rel="noreferrer">Open {g.site}<ExternalLink size={14} /></a>}
                  {!ws.canManage && <p className="wz-warn">Only workspace owners and admins can connect providers. Ask an admin to connect {spec.label.replace(/ \(.*\)$/, '')}, then it appears here for everyone.</p>}
                </div>
              </motion.div>)}

            {step === 2 && spec && (
              <motion.div key="s2" {...slide} className="wz-form">
                <KeyIllo state={busy ? null : check ? (check.ok ? 'ok' : 'bad') : null} />
                {spec.requires_base_url && <label className="field">Server address<small>Public https address of the endpoint{providerId === 'openai_compatible' ? ', usually ending in /v1' : ''}.</small>
                  <input type="url" value={form.api_base} onChange={e => { setForm({ ...form, api_base: e.target.value }); setCheck(null); }} placeholder="https://models.example.com/v1" autoFocus /></label>}
                <label className="field">API key{!spec.requires_key && <small>Optional</small>}
                  <span className="wz-key"><KeyRound size={16} /><input type="password" autoComplete="off" value={form.api_key} autoFocus={!spec.requires_base_url}
                    onChange={e => { setForm({ ...form, api_key: e.target.value }); setCheck(null); }} placeholder={g.prefix ? `${g.prefix}…` : 'Paste the key'} maxLength={1000} /></span>
                  {prefixWarn && <small className="warn-text">Keys from {g.site} usually start with {g.prefix}. Check you copied the whole key.</small>}</label>
                <div className="form-grid">
                  <label className="field">Model to start with<small>Any model the provider offers.</small>
                    <Combo value={form.model} onChange={v => { setForm({ ...form, model: v }); setCheck(null); }} suggestions={spec.suggestions} placeholder={spec.suggestions[0]} /></label>
                  <label className="field">Name in Galdus<small>Optional</small>
                    <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder={spec.label.replace(/ \(.*\)$/, '')} maxLength={80} /></label>
                </div>
                <p className="wz-note"><ShieldCheck size={15} />The key is encrypted in your workspace and never shown again. Only owners and admins can remove it.</p>
                <AnimatePresence>{check && !check.ok && (
                  <motion.div className="wz-error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <b>{explain(check).title}</b><span>{explain(check).tip}</span>
                    <details><summary>Provider message</summary><code>{check.message || check.error}</code></details>
                  </motion.div>)}</AnimatePresence>
              </motion.div>)}

            {step === 3 && created && (
              <motion.div key="s3" {...slide} className="wz-done">
                <motion.div className="wz-burst" initial={reduce ? false : { scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
                  <CheckCircle2 size={56} /></motion.div>
                <h3>{created.label} is connected</h3>
                <p className="muted">{check?.ok ? `${form.model} answered the test. ` : ''}Every page in this workspace can now use it: chat, agents, apps and automations.</p>
              </motion.div>)}
          </AnimatePresence>
        </div>

        <footer className="wz-foot">
          {step > 0 && step < 3 ? <button type="button" className="btn quiet" onClick={() => { setStep(s => s - 1); setCheck(null); }}><ArrowLeft size={15} /> Back</button> : <span />}
          {step === 1 && ws.canManage && <button type="button" className="btn" onClick={() => setStep(2)}>I have my {g.self ? 'address' : 'key'} <ArrowRight size={15} /></button>}
          {step === 2 && (
            <div className="actions">
              {check && !check.ok && <button type="button" className="btn ghost" disabled={busy} onClick={() => testAndSave(true)}>Save anyway</button>}
              <button type="button" className="btn" disabled={!canTest || busy} onClick={() => testAndSave(false)}>{busy ? <><Pixels label="Testing" /> Testing…</> : 'Test and connect'}</button>
            </div>)}
          {step === 3 && <button type="button" className="btn" onClick={() => onClose({ connectionId: created.id, model: form.model.trim() })}>Use {form.model.trim()} <ArrowRight size={15} /></button>}
        </footer>
      </motion.div>
    </motion.div>
  );
}
