import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Bot, BookOpen, Cpu, LogIn, Mail, ShieldCheck, Code2, Workflow } from 'lucide-react';
import { api } from './api';
import { API_BASE_URL } from './config';
import { Aurora, Mark, Wordmark } from './brand';
import { BASE, href } from './paths';
import { VikingScene } from './viking';

const CAPABILITIES = [
  [Cpu, 'Any model', 'Bring your own key: OpenAI, Anthropic, Qwen, DeepSeek, Mistral, local Ollama.'],
  [BookOpen, 'Your knowledge', 'Documents, Google Drive and SharePoint, with cited answers.'],
  [Bot, 'Agents with tools', 'Assistants that search, calculate, browse and call MCP tools.'],
  [Workflow, 'Automations', 'Schedules and webhooks, results delivered to Slack or Teams.'],
  [ShieldCheck, 'Team governance', 'Roles, audit log, usage limits and guardrails.'],
  [Code2, 'Open source', 'AGPL-3.0 and self-hostable. Your data stays where you put it.'],
];
const HEADLINE = ['Forged', 'by', 'people.', 'Powered', 'by', 'AI.'];
const LABEL = { google: 'Google', github: 'GitHub' };

// Official provider marks are not bundled: drop the logo files from the Google and GitHub
// brand kits into apps/web/public/brand/ (google.svg, github.svg) and they appear here.
function ProviderMark({ id }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <LogIn size={16} />;
  return <img src={`${BASE}/brand/${id}.svg`} alt="" width="18" height="18" onError={() => setOk(false)} />;
}

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
    <div className="landing v3">
      <Aurora />
      <VikingScene />
      <section className="landing-hero">
        <div className="brand-row"><Mark size={46} animate /><motion.span {...at(1.2)}><Wordmark /></motion.span></div>
        <div className="hero-body">
          <h1 className="grad-text" aria-label={HEADLINE.join(' ')}>
            {[HEADLINE.slice(0, 3), HEADLINE.slice(3)].map((line, l) => (
              <span key={l} className="line">{line.map((w, i) => (
                <motion.span key={w + i} className="w" aria-hidden="true" {...at(1.25 + (l * 3 + i) * .1)}>{w}{i < line.length - 1 ? '\u00a0' : ''}</motion.span>))}
              </span>))}
          </h1>
          <motion.p className="lead" {...at(2)}>Galdus.ai is the open AI operating system. Any model, your company knowledge, agents and automations in one workspace you control.</motion.p>
          <motion.ul className="cap-chips" initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: .06, delayChildren: reduce ? 0 : 2.2 } } }}>
            {CAPABILITIES.map(([Icon, t, d]) => (
              <motion.li key={t} title={d} variants={{ hidden: { opacity: 0, y: 8, scale: .9 }, show: { opacity: 1, y: 0, scale: 1 } }}>
                <Icon size={14} strokeWidth={2.4} />{t}
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
                  <a key={p} className="btn oauth block" href={`${API_BASE_URL}/v1/auth/oauth/${p}/start`}><ProviderMark id={p} /> Continue with {LABEL[p]}</a>))}
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
