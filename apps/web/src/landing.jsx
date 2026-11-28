// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BookOpen, Box, Bot, Code2, LogIn, Mail, ShieldCheck, Workflow } from 'lucide-react';
import { api } from './api';
import { API_BASE_URL } from './config';
import { Mark, Wordmark } from './brand';
import { Backdrop } from './hero';
import { BASE, href } from './paths';

const FEATURES = [
  [Box, 'Any model', 'Bring your own key: OpenAI, Anthropic, Google, DeepSeek and more.'],
  [BookOpen, 'Your knowledge', 'Documents, Google Drive and SharePoint, with cited answers.'],
  [Bot, 'Agents with tools', 'Search, calculate, browse and call MCP tools.'],
  [Workflow, 'Automations', 'Schedules and webhooks, delivered to Slack or Teams.'],
  [ShieldCheck, 'Team governance', 'Roles, audit logs, usage limits and guardrails.'],
  [Code2, 'Open source', 'AGPL-3.0 and self-hostable. Your data stays where you put it.'],
];
const LABEL = { google: 'Google', github: 'GitHub', microsoft: 'Microsoft' };
const REPO = 'https://github.com/coobox-89/galdus.ai';

// Official sign-in marks are not bundled (they are third-party trademarks). To show one, add
// google.svg, github.svg or microsoft.svg from the provider's brand kit to apps/web/public/brand/
// and list its id here; until then a neutral icon is used and no request is made (no 404 in the console).
const SIGN_IN_MARKS = new Set([]);
function ProviderMark({ id }) {
  const [ok, setOk] = useState(SIGN_IN_MARKS.has(id));
  if (!ok) return <LogIn size={17} aria-hidden="true" />;
  return <img src={`${BASE}/brand/${id}.svg`} alt="" width="20" height="20" onError={() => setOk(false)} />;
}

export function Landing({ onAuthenticated, message, setMessage, resetToken, mfaToken: initialMfa = '', notice = '' }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState(initialMfa ? 'mfa' : resetToken ? 'reset' : 'login');
  const [mfaToken, setMfaToken] = useState(initialMfa);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', organization_name: '' });
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState({ login: [], email: false });
  const [note, setNote] = useState(notice);
  const emailRef = useRef(null);
  useEffect(() => { api('/v1/auth/providers').then(setProviders).catch(() => {}); }, []);
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const at = (d, from = { y: 18 }) => (reduce ? {} : { initial: { opacity: 0, filter: 'blur(8px)', ...from }, animate: { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' },
    transition: { duration: .8, delay: d, ease: [0.16, 1, 0.3, 1] } });

  async function submit(e) {
    e.preventDefault();
    setMessage(''); setNote(''); setBusy(true);
    try {
      if (mode === 'forgot') {
        const r = await api('/v1/auth/password/forgot', { method: 'POST', body: { email: form.email } });
        setNote(r.email_enabled ? 'If an account exists for this email, a reset link is on its way.' : 'Password reset by email is not enabled on this server yet. Ask the workspace owner.');
      } else if (mode === 'reset') {
        await api('/v1/auth/password/reset', { method: 'POST', body: { token: resetToken, password: form.password } });
        window.location.hash = ''; setMode('login'); setNote('Password updated. Sign in with your new password.');
      } else if (mode === 'mfa') {
        onAuthenticated(await api('/v1/auth/mfa/verify', { method: 'POST', body: { mfa_token: mfaToken, code: code.trim() } }));
      } else {
        const registering = mode === 'register';
        const r = await api(registering ? '/v1/auth/register' : '/v1/auth/login', {
          method: 'POST', body: registering ? form : { email: form.email, password: form.password } });
        if (r.mfa_required) { setMfaToken(r.mfa_token); setCode(''); setRecovery(false); setMode('mfa'); return; }
        if (r.verification_required) {
          // The server asks to confirm the address before the first sign-in (same answer for new and existing emails).
          setMode('login'); setForm(f => ({ ...f, password: '' }));
          setNote(`Check your inbox at ${r.email}: open the link we sent to confirm your address, then sign in.`);
          return;
        }
        onAuthenticated(r);
      }
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }

  const copy = {
    login: ['Welcome back', 'Sign in to your workspace.', 'Sign in'],
    register: ['Create your workspace', 'Free during early access. No card needed.', 'Create workspace'],
    forgot: ['Reset your password', 'We will email you a link to choose a new one.', 'Send reset link'],
    reset: ['Choose a new password', 'At least 12 characters.', 'Save new password'],
    mfa: ['Two-step verification', recovery ? 'Enter one of your recovery codes. Each one works once.' : 'Enter the 6-digit code from your authenticator app.', 'Verify and sign in'],
  }[mode];

  return (
    <div className="login-hero">
      <Backdrop />
      <motion.header className="lh-top" {...at(.9, { y: -14 })}>
        <a className="lh-brand" href={href('/')} aria-label="Galdus.ai home"><Mark size={40} /><Wordmark /></a>
      </motion.header>

      <main className="lh-main">
        <section className="lh-copy">
          <h1 aria-label="The AI operating system.">
            {[['The', ' '], ['AI', ' ', 'lime'], ['operating', ' '], ['system', '', ''], ['.', '', 'lime']].map(([w, sp, c], i) => (
              <motion.span key={i} aria-hidden="true" className={`w ${c || ''} ${w === 'operating' ? 'br' : ''}`} {...at(1.1 + i * .1, { y: 40 })}>{w}{sp}</motion.span>))}
          </h1>
          <motion.p className="lh-sub" {...at(1.7)}>Forge the past. <span className="lime">Harness</span> the artificial.</motion.p>
          <motion.span className="lh-bar" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.9, duration: .6, ease: [0.16, 1, 0.3, 1] }} />
          <motion.ul id="features" className="lh-features" initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: .08, delayChildren: reduce ? 0 : 2 } } }}>
            {FEATURES.map(([Icon, t, d]) => (
              <motion.li key={t} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } } }}>
                <Icon size={30} strokeWidth={1.6} className="ic" /><div><b>{t}</b><span>{d}</span></div>
              </motion.li>))}
          </motion.ul>
        </section>

        <motion.section className="lh-card" aria-label="Sign in" {...at(1.3, { x: 40 })}>
          <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>
            <h2>{copy[0]}</h2>
            <p className="lh-muted">{copy[1]}</p>
            {(mode === 'login' || mode === 'register') && providers.login.length > 0 && <>
              <div className="lh-oauth">
                {providers.login.map(p => (
                  <a key={p} className="lh-oauth-btn" href={`${API_BASE_URL}/v1/auth/oauth/${p}/start`}><ProviderMark id={p} /> Continue with {LABEL[p]}</a>))}
              </div>
              <div className="divider">or with email</div>
            </>}
            <form className="form" onSubmit={submit} aria-busy={busy}>
              {mode === 'register' && <>
                <label className="field">Full name<input value={form.full_name} onChange={set('full_name')} autoComplete="name" required maxLength={160} /></label>
                <label className="field">Workspace name<input value={form.organization_name} onChange={set('organization_name')} required minLength={2} maxLength={160} placeholder="Your company or team" /></label>
              </>}
              {mode === 'mfa' && <>
                <span className="mfa-ico" aria-hidden="true"><ShieldCheck size={26} /></span>
                <label className="field">{recovery ? 'Recovery code' : 'Authentication code'}
                  <input className={recovery ? '' : 'otp'} value={code} onChange={e => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code" autoFocus required minLength={6} maxLength={recovery ? 20 : 6}
                    placeholder={recovery ? 'abc123-def456' : '••••••'} /></label>
                <button type="button" className="linkish" style={{ justifySelf: 'start' }} onClick={() => { setRecovery(r => !r); setCode(''); }}>
                  {recovery ? 'Use the authenticator app instead' : 'Lost your phone? Use a recovery code'}</button>
              </>}
              {mode !== 'reset' && mode !== 'mfa' && <label className="field">Email<input ref={emailRef} type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>}
              {mode !== 'forgot' && mode !== 'mfa' && (
                <label className="field">
                  <span className="lh-row">{mode === 'reset' ? 'New password' : 'Password'}
                    {mode === 'login' && <button type="button" className="linkish" onClick={() => { setMode('forgot'); setMessage(''); }}>Forgot password?</button>}</span>
                  <input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required minLength={mode === 'login' ? 1 : 12} maxLength={128} />
                </label>)}
              {message && <p role="alert" className="small" style={{ color: 'var(--danger)', margin: 0 }}>{message}</p>}
              {note && <p role="status" className="small" style={{ color: 'var(--lime)', margin: 0 }}><Mail size={13} style={{ verticalAlign: -2 }} /> {note}</p>}
              <button className="btn block lh-submit" disabled={busy}>{busy ? 'One moment…' : copy[2]}</button>
            </form>
            <p className="lh-switch">
              {mode === 'login' && <>New to Galdus.ai? <button type="button" className="linkish" onClick={() => { setMode('register'); setMessage(''); }}>Create a workspace</button></>}
              {mode !== 'login' && <>Back to <button type="button" className="linkish" onClick={() => { setMode('login'); setMfaToken(''); setMessage(''); window.location.hash = ''; }}>sign in</button></>}
            </p>
          </motion.div>
        </motion.section>
      </main>

      <motion.footer className="lh-foot" {...at(2.4, { y: 10 })}>
        <div className="lh-sign">
          <Mark size={30} />
          <div>
            <b>Galdus<i>.ai</i></b>
            <span>Powered by you. <em>Supercharged by AI.</em></span>
          </div>
        </div>
        <nav aria-label="Legal">
          <a href={href('/privacy')}>Privacy</a><a href={href('/terms')}>Terms</a>
          <a href={href('/acceptable-use')}>Acceptable use</a><a href={href('/terms')}>Trademarks</a>
          <a href={`${REPO}/tree/main/docs`} target="_blank" rel="noreferrer">Docs</a><a href={REPO} target="_blank" rel="noreferrer">Source code</a>
        </nav>
        <p className="lh-meta"><span className="lh-pill"><i />Public beta</span><span>© {new Date().getFullYear()} Mario Cubello, AGPL-3.0</span></p>
        <ModelMarquee />
      </motion.footer>
    </div>
  );
}

// Providers shown on the sign-in page. Marks are trademarks of their owners (see Terms, Trademarks).
const MARQUEE = [['openai', 'OpenAI'], ['anthropic', 'Anthropic'], ['ollama', 'Ollama'], ['xai', 'xAI']];

function ModelMarquee() {
  const row = [...MARQUEE, ...MARQUEE, ...MARQUEE];
  return (
    <div className="lh-models">
      <span className="lh-models-label">Bring your own API key</span>
      <div className="lh-marquee" role="img" aria-label={`Works with ${MARQUEE.map(m => m[1]).join(', ')} and more`}>
        <div className="lh-marquee-track" aria-hidden="true">
          {[row, row].map((r, k) => (
            <div className="lh-marquee-set" key={k}>
              {r.map(([id, name], i) => (
                <span key={`${id}-${i}`} className="lh-logo" title={name} style={{ WebkitMaskImage: `url(${BASE}/brand/providers/${id}.svg)`, maskImage: `url(${BASE}/brand/providers/${id}.svg)` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
