import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { api } from './api';
import { Mark, Swoosh, Wordmark } from './brand';
import { href } from './paths';

const CAPABILITIES = [
  ['Any model', 'Bring your own key: OpenAI, Anthropic, Qwen, DeepSeek, Mistral, local Ollama.'],
  ['Your knowledge', 'Upload documents and get answers that cite their sources.'],
  ['Agents with tools', 'Assistants that search, calculate, browse and call MCP tools.'],
  ['Automations', 'Run agents on a schedule or from a webhook, deliver to Slack or Teams.'],
  ['Team governance', 'Roles, invitations, audit log, usage limits and guardrails.'],
  ['Open source', 'AGPL-3.0, self-hostable, your data stays where you put it.'],
];

export function Landing({ onAuthenticated, message, setMessage }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '', organization_name: '' });
  const [busy, setBusy] = useState(false);
  const registering = mode === 'register';
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const intro = (i) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 },
    transition: { duration: .6, delay: 1.3 + i * .08, ease: [0.16, 1, 0.3, 1] } });

  async function submit(e) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const data = await api(registering ? '/v1/auth/register' : '/v1/auth/login', {
        method: 'POST', body: registering ? form : { email: form.email, password: form.password } });
      onAuthenticated(data);
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="landing">
      <Swoosh flip style={{ right: -80, bottom: -120, width: 'min(40vw, 520px)', opacity: .85 }} />
      <section className="landing-hero">
        <div className="brand-row"><Mark size={44} animate /><motion.span {...intro(0)}><Wordmark /></motion.span></div>
        <div className="hero-body">
          <motion.h1 {...intro(1)}>The open AI operating system.</motion.h1>
          <motion.p className="lead" {...intro(2)}>One workspace for every model, your company knowledge, agents and automations. Model-agnostic, self-hostable and built for teams.</motion.p>
          <motion.ul className="capabilities" {...intro(3)}>
            {CAPABILITIES.map(([t, d]) => <li key={t}><span className="px" /><div><b>{t}</b><span>{d}</span></div></li>)}
          </motion.ul>
        </div>
        <div className="landing-foot">
          <a href={href('/privacy')}>Privacy</a><a href={href('/terms')}>Terms</a><a href={href('/acceptable-use')}>Acceptable use</a>
          <a href="https://github.com/coobox-89/galdus.ai">Source code</a><span>Early access</span>
        </div>
      </section>
      <section className="landing-auth">
        <motion.div className="auth-card" {...(reduce ? {} : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 },
          transition: { duration: .7, delay: 1.1, ease: [0.16, 1, 0.3, 1] } })}>
          <h2>{registering ? 'Create your workspace' : 'Welcome back'}</h2>
          <p>{registering ? 'Free during early access. No card needed.' : 'Sign in to your workspace.'}</p>
          <form className="form" onSubmit={submit} aria-busy={busy}>
            {registering && <>
              <label className="field">Full name<input value={form.full_name} onChange={set('full_name')} autoComplete="name" required maxLength={160} /></label>
              <label className="field">Workspace name<input value={form.organization_name} onChange={set('organization_name')} required minLength={2} maxLength={160} placeholder="Your company or team" /></label>
            </>}
            <label className="field">Email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
            <label className="field">Password{registering && <small>At least 12 characters</small>}
              <input type="password" value={form.password} onChange={set('password')} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : 1} maxLength={128} />
            </label>
            {message && <p role="alert" className="small" style={{ color: 'var(--danger)', margin: 0 }}>{message}</p>}
            <button className="btn block" disabled={busy}>{busy ? 'One moment…' : registering ? 'Create workspace' : 'Sign in'}</button>
          </form>
          <p className="auth-switch">{registering ? 'Already have an account?' : 'New to Galdus.ai?'}{' '}
            <button type="button" className="linkish" onClick={() => { setMode(registering ? 'login' : 'register'); setMessage(''); }}>
              {registering ? 'Sign in' : 'Create a workspace'}</button></p>
        </motion.div>
      </section>
    </div>
  );
}
