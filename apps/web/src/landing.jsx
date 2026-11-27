import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Bot, BookOpen, Cpu, LogIn, Mail, ShieldCheck, Code2, Workflow } from 'lucide-react';
import { api } from './api';
import { API_BASE_URL } from './config';
import { Aurora, Mark, Swoosh, Wordmark } from './brand';
import { href } from './paths';

const CAPABILITIES = [
  [Cpu, 'Any model', 'Bring your own key: OpenAI, Anthropic, Qwen, DeepSeek, Mistral, local Ollama.'],
  [BookOpen, 'Your knowledge', 'Documents, Google Drive and SharePoint, with cited answers.'],
  [Bot, 'Agents with tools', 'Assistants that search, calculate, browse and call MCP tools.'],
  [Workflow, 'Automations', 'Schedules and webhooks, results delivered to Slack or Teams.'],
  [ShieldCheck, 'Team governance', 'Roles, audit log, usage limits and guardrails.'],
  [Code2, 'Open source', 'AGPL-3.0 and self-hostable. Your data stays where you put it.'],
];
const HEADLINE = ['The', 'open', 'AI', 'operating', 'system.'];
const LABEL = { google: 'Google', github: 'GitHub' };

export function Landing({ onAuthenticated, message, setMessage, resetToken }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '', organization_name: '' });
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState({ login: [], email: false });
  const [note, setNote] = useState('');
  useEffect(() => { api('/v1/auth/providers').then(setProviders).catch(() => {}); }, []);
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  const at = (d, extra = {}) => (reduce ? {} : { initial: { opacity: 0, y: 16, filter: 'blur(6px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: .7, delay: d, ease: [0.16, 1, 0.3, 1], ...extra } });

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
      } else {
        const registering = mode === 'register';
        const data = await api(registering ? '/v1/auth/register' : '/v1/auth/login', {
          method: 'POST', body: registering ? form : { email: form.email, password: form.password } });
        onAuthenticated(data);
      }
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }

  const copy = {
    login: ['Welcome back', 'Sign in to your workspace.', 'Sign in'],
    register: ['Create your workspace', 'Free during early access. No card needed.', 'Create workspace'],
    forgot: ['Reset your password', 'We will email you a link to choose a new one.', 'Send reset link'],
    reset: ['Choose a new password', 'At least 12 characters.', 'Save new password'],
  }[mode];

  return (
    <div className="landing">
      <Aurora />
      <Swoosh flip style={{ right: -80, bottom: -120, width: 'min(40vw, 520px)', opacity: .9 }} />
      <section className="landing-hero">
        <div className="brand-row"><Mark size={46} animate /><motion.span {...at(1.2)}><Wordmark /></motion.span></div>
        <div className="hero-body">
          <h1 className="grad-text" aria-label={HEADLINE.join(' ')}>
            {HEADLINE.map((w, i) => (
              <motion.span key={w} className="w" aria-hidden="true" {...at(1.25 + i * .09)}>{w}{i < HEADLINE.length - 1 ? ' ' : ''}</motion.span>
            ))}
          </h1>
          <motion.p className="lead" {...at(1.8)}>One workspace for every model, your company knowledge, agents and automations. Model-agnostic, self-hostable and built for teams.</motion.p>
          <motion.ul className="capabilities" initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: .07, delayChildren: reduce ? 0 : 1.95 } } }}>
            {CAPABILITIES.map(([Icon, t, d]) => (
              <motion.li key={t} variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } }}>
                <span className="px"><Icon size={16} strokeWidth={2.2} /></span><div><b>{t}</b><span>{d}</span></div>
              </motion.li>))}
          </motion.ul>
        </div>
        <div className="landing-foot">
          <a href={href('/privacy')}>Privacy</a><a href={href('/terms')}>Terms</a><a href={href('/acceptable-use')}>Acceptable use</a>
          <a href="https://github.com/coobox-89/galdus.ai">Source code</a><span>Early access</span>
        </div>
      </section>
      <section className="landing-auth">
        <motion.div className="auth-card" {...(reduce ? {} : { initial: { opacity: 0, x: 30, scale: .97 }, animate: { opacity: 1, x: 0, scale: 1 },
          transition: { duration: .8, delay: 1.05, ease: [0.16, 1, 0.3, 1] } })}>
          <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>
            <h2>{copy[0]}</h2>
            <p className="muted" style={{ margin: '6px 0 20px' }}>{copy[1]}</p>
            {(mode === 'login' || mode === 'register') && providers.login.length > 0 && <>
              <div className="stack" style={{ gap: 10 }}>
                {providers.login.map(p => (
                  <a key={p} className="btn oauth block" href={`${API_BASE_URL}/v1/auth/oauth/${p}/start`}><LogIn size={16} /> Continue with {LABEL[p]}</a>))}
              </div>
              <div className="divider">or with email</div>
            </>}
            <form className="form" onSubmit={submit} aria-busy={busy}>
              {mode === 'register' && <>
                <label className="field">Full name<input value={form.full_name} onChange={set('full_name')} autoComplete="name" required maxLength={160} /></label>
                <label className="field">Workspace name<input value={form.organization_name} onChange={set('organization_name')} required minLength={2} maxLength={160} placeholder="Your company or team" /></label>
              </>}
              {mode !== 'reset' && <label className="field">Email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>}
              {mode !== 'forgot' && (
                <label className="field">
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}>{mode === 'reset' ? 'New password' : 'Password'}
                    {mode === 'login' && <button type="button" className="linkish" style={{ fontSize: 12 }} onClick={() => { setMode('forgot'); setMessage(''); }}>Forgot password?</button>}</span>
                  <input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required minLength={mode === 'login' ? 1 : 12} maxLength={128} />
                </label>)}
              {message && <p role="alert" className="small" style={{ color: 'var(--danger)', margin: 0 }}>{message}</p>}
              {note && <p role="status" className="small" style={{ color: 'var(--lime)', margin: 0 }}><Mail size={13} style={{ verticalAlign: -2 }} /> {note}</p>}
              <button className="btn block" disabled={busy}>{busy ? 'One moment…' : copy[2]}</button>
            </form>
            <p className="auth-switch">
              {mode === 'login' && <>New to Galdus.ai? <button type="button" className="linkish" onClick={() => { setMode('register'); setMessage(''); }}>Create a workspace</button></>}
              {mode !== 'login' && <>Back to <button type="button" className="linkish" onClick={() => { setMode('login'); setMessage(''); window.location.hash = ''; }}>sign in</button></>}
            </p>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
