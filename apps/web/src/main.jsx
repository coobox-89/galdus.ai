import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { AcceptableUse, Privacy, Terms } from './legal';
import { AdminConsole } from './admin';
import { ModelPicker, useModelSources } from './modelpicker';
import { ModelsTab } from './models';
import { KnowledgeTab, useCollections } from './knowledge';
import { AgentsTab } from './agents';
import { AppsTab } from './apps';
import { currentRoute, href } from './paths';
import './style.css';

const modules = [
  ['Models', 'Connect hosted and local models'],
  ['Agents', 'Build task-oriented assistants'],
  ['Knowledge', 'Ground answers in your sources'],
  ['Automation', 'Orchestrate repeatable workflows'],
  ['Governance', 'Manage access, policies and audit'],
];

const TOKEN_KEY = 'galdus_token';
const EXPIRY_KEY = 'galdus_token_expires_at';

function loadToken() {
  const token = sessionStorage.getItem(TOKEN_KEY) || '';
  const expiresAt = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
  if (!token || (expiresAt && Date.now() >= expiresAt)) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    return '';
  }
  return token;
}

function AuthForm({ onAuthenticated, message, setMessage }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [busy, setBusy] = useState(false);
  const registering = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const data = await api(registering ? '/v1/auth/register' : '/v1/auth/login', {
        method: 'POST',
        body: registering
          ? { email, password, full_name: fullName, organization_name: organizationName }
          : { email, password },
      });
      setPassword('');
      onAuthenticated(data, registering ? 'Workspace created successfully.' : 'Signed in successfully.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>{registering ? 'Create your workspace' : 'Welcome back'}</h2>
      <p>{registering ? 'Set up your personal or team workspace.' : 'Sign in to continue to your AI workspace.'}</p>
      <form onSubmit={submit} aria-busy={busy}>
        {registering && <>
          <label>Full name<input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required maxLength={160} /></label>
          <label>Workspace / organization name<input value={organizationName} onChange={e => setOrganizationName(e.target.value)} required minLength={2} maxLength={160} /></label>
        </>}
        <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label>Password{registering && <small> (at least 12 characters)</small>}
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : 1} maxLength={128} />
        </label>
        <button disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="switch-mode">
        {registering ? 'Already have an account?' : 'New to Galdus.ai?'}{' '}
        <button type="button" className="text-button" onClick={() => { setMode(registering ? 'login' : 'register'); setMessage(''); }}>
          {registering ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </>
  );
}

function ChatTab({ token, organizationId, sources, onError }) {
  const [selection, setSelection] = useState({ connectionId: '', model: '' });
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(0);
  const endRef = useRef(null);
  const pick = useCallback(v => setSelection(v), []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);

  async function send(event) {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next); setPrompt(''); setBusy(true);
    try {
      const data = await api('/v1/chat/completions', { token, organizationId, method: 'POST', body: {
        connection_id: selection.connectionId || undefined, model: selection.model || undefined, messages: next } });
      setMessages([...next, { role: 'assistant', content: data.content, model: data.model }]);
      setUsage(u => u + (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0));
    } catch (err) {
      setMessages(messages); setPrompt(content); onError(err);
    } finally { setBusy(false); }
  }

  if (!sources.loaded) return <p>Loading models…</p>;
  return (
    <>
      <ModelPicker sources={sources} value={selection} onChange={pick} />
      <div className="conversation" aria-live="polite">
        {messages.length === 0 && !busy && <p className="empty">Start a conversation with the selected model.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}><b>{m.role === 'user' ? 'You' : (m.model || 'Assistant')}</b><pre>{m.content}</pre></div>
        ))}
        {busy && <div className="bubble assistant"><b>{selection.model || 'Assistant'}</b><pre>Thinking…</pre></div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={send}>
        <label className="sr-only" htmlFor="prompt">Message</label>
        <textarea id="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ask anything…" maxLength={100000} required
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e); }} />
        <div className="row">
          <button disabled={busy || !selection.model}>{busy ? 'Sending…' : 'Send'}</button>
          <button type="button" className="secondary" disabled={busy || !messages.length} onClick={() => setMessages([])}>New conversation</button>
          {usage > 0 && <small className="usage">{usage} tokens this session</small>}
        </div>
      </form>
    </>
  );
}

const TABS = [['chat', 'Chat'], ['apps', 'Apps'], ['agents', 'Agents'], ['knowledge', 'Knowledge'], ['models', 'Models']];

function Workspace({ token, user, onExpired, onLogout }) {
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState('chat');
  const [refreshKey, setRefreshKey] = useState(0);

  const handle = useCallback((err) => {
    if (err.status === 401) onExpired();
    else setError(err.message);
  }, [onExpired]);

  useEffect(() => {
    let active = true;
    api('/v1/auth/organizations', { token })
      .then(orgs => { if (active) { setOrganizations(orgs); setOrganizationId(orgs[0]?.id || ''); } })
      .catch(handle);
    return () => { active = false; };
  }, [token, handle]);

  const sources = useModelSources(token, organizationId, handle, refreshKey);
  const collections = useCollections(token, organizationId, handle, refreshKey);
  const changed = () => setRefreshKey(k => k + 1);
  const role = organizations.find(o => o.id === organizationId)?.role;
  const common = { token, organizationId, role, sources, collections, onError: handle };
  const tabs = user?.is_platform_admin ? [...TABS, ['admin', 'Admin console']] : TABS;

  return (
    <>
      <div className="workspace-head">
        <div>
          <h2>Your workspace</h2>
          <p>{user ? `Signed in as ${user.full_name} (${user.email}).` : 'Verifying your session…'}</p>
        </div>
        <div className="row">
          <select aria-label="Workspace" value={organizationId} onChange={e => setOrganizationId(e.target.value)} disabled={organizations.length < 2}>
            {organizations.map(o => <option key={o.id} value={o.id}>{o.name} · {o.role}</option>)}
          </select>
          <button type="button" className="secondary" onClick={onLogout}>Sign out</button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? '' : 'secondary'}
            onClick={() => { setView(id); setError(''); }}>{label}</button>
        ))}
      </div>
      {view === 'chat' && <ChatTab key={organizationId} token={token} organizationId={organizationId} sources={sources} onError={handle} />}
      {view === 'apps' && <AppsTab key={organizationId} {...common} />}
      {view === 'agents' && <AgentsTab key={organizationId} {...common} />}
      {view === 'knowledge' && <KnowledgeTab key={organizationId} {...common} onChanged={changed} />}
      {view === 'models' && <ModelsTab token={token} organizationId={organizationId} role={role} sources={sources}
        onChanged={() => setRefreshKey(k => k + 1)} onError={handle} />}
      {view === 'admin' && user?.is_platform_admin && <AdminConsole token={token} currentUserId={user.id} onError={handle} />}
      {error && <p role="alert" className="error">{error}</p>}
      <AccountPanel token={token} onDeleted={onLogout} onError={handle} />
    </>
  );
}

function AccountPanel({ token, onDeleted, onError }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function exportData() {
    try {
      const data = await api('/v1/auth/export', { token });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'galdus-account-export.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { onError(err); }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/v1/auth/account/delete', { token, method: 'POST', body: { password } });
      onDeleted('Your account and its data were deleted.');
    } catch (err) {
      if (err.status === 401 && err.message === 'Password is incorrect') onError({ message: err.message });
      else onError(err);
    } finally { setBusy(false); setPassword(''); }
  }

  return (
    <details className="account" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>Account and data</summary>
      <div className="row"><button type="button" className="secondary" onClick={exportData}>Download my data</button></div>
      <form onSubmit={deleteAccount}>
        <label>Confirm your password to permanently delete your account and workspaces you own alone
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required maxLength={128} />
        </label>
        <button className="danger" disabled={busy}>{busy ? 'Deleting…' : 'Delete account'}</button>
      </form>
    </details>
  );
}

function App() {
  const [token, setToken] = useState(loadToken);
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState('');

  const clearSession = useCallback((note) => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    setToken('');
    setUser(null);
    setMessage(note);
  }, []);
  const expire = useCallback(() => clearSession('Your session expired. Please sign in again.'), [clearSession]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    api('/v1/auth/me', { token })
      .then(data => { if (active) setUser(data); })
      .catch(err => { if (!active) return; if (err.status === 401) expire(); else setMessage(err.message); });
    const expiresAt = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    const timer = expiresAt ? setTimeout(expire, Math.max(0, expiresAt - Date.now())) : undefined;
    return () => { active = false; clearTimeout(timer); };
  }, [token, expire]);

  function onAuthenticated(data, note) {
    sessionStorage.setItem(TOKEN_KEY, data.access_token);
    sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + data.expires_in * 1000));
    setUser(data.user);
    setToken(data.access_token);
    setMessage(note);
  }

  return (
    <main>
      <nav><strong>GALDUS<span>.AI</span></strong><small>THE OPEN AI OPERATING SYSTEM</small></nav>
      <header>
        <p className="eyebrow">ONE CONTROL PLANE FOR AI</p>
        <h1>Make AI work<br /><em>on your terms.</em></h1>
        <p className="lead">Models, agents, knowledge and automation in one open, self-hostable workspace.</p>
      </header>
      <section className="modules" aria-label="Planned modules">
        {modules.map(([name, description], index) => (
          <article key={name}><b>0{index + 1}</b><h2>{name}</h2><p>{description}</p></article>
        ))}
      </section>
      <section className="playground">
        {token
          ? <Workspace token={token} user={user} onExpired={expire} onLogout={(note) => clearSession(typeof note === 'string' ? note : 'Signed out.')} />
          : <AuthForm onAuthenticated={onAuthenticated} message={message} setMessage={setMessage} />}
        {message && !token && <p role="status" className="status">{message}</p>}
      </section>
      <footer>
        Early access ·{' '}
        <a href={href('/privacy')}>Privacy</a> · <a href={href('/terms')}>Terms</a> · <a href={href('/acceptable-use')}>Acceptable use</a> ·{' '}
        <a href="https://github.com/coobox-89/galdus.ai">Source (AGPL-3.0-only)</a>
      </footer>
    </main>
  );
}

const routes = { '/privacy': Privacy, '/terms': Terms, '/acceptable-use': AcceptableUse };

function Root() {
  const Legal = routes[currentRoute()];
  if (Legal) return <main><nav><a href={href('/')} className="brand"><strong>GALDUS<span>.AI</span></strong></a></nav><Legal /></main>;
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
