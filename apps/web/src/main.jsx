import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { API_BASE_URL } from './config';
import './style.css';

const modules = [
  ['Models', 'Connect hosted and local models'],
  ['Agents', 'Build task-oriented assistants'],
  ['Knowledge', 'Ground answers in your sources'],
  ['Automation', 'Orchestrate repeatable workflows'],
  ['Governance', 'Manage access, policies and audit'],
];

function App() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('galdus_token') || '');
  const [user, setUser] = useState(null);
  const [authMessage, setAuthMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  async function authenticate(event) {
    event.preventDefault();
    setAuthMessage('');
    const registering = mode === 'register';
    const endpoint = registering ? '/v1/auth/register' : '/v1/auth/login';
    const payload = registering
      ? { email, password, full_name: fullName, organization_name: organizationName }
      : { email, password };
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Authentication failed');
      sessionStorage.setItem('galdus_token', data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      setAuthMessage(registering ? 'Workspace created successfully.' : 'Signed in successfully.');
      setPassword('');
    } catch (error) {
      setAuthMessage(error.message);
    }
  }

  async function sendPrompt(event) {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setAnswer('');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Request failed');
      setAnswer(data.content || '');
    } catch (error) {
      setAnswer(`Connection error: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem('galdus_token');
    setToken('');
    setUser(null);
    setAnswer('');
    setAuthMessage('Signed out.');
  }

  return (
    <main>
      <nav><strong>GALDUS<span>.AI</span></strong><small>THE OPEN AI OPERATING SYSTEM</small></nav>
      <header>
        <p className="eyebrow">ONE CONTROL PLANE FOR AI</p>
        <h1>Make AI work<br /><em>on your terms.</em></h1>
        <p className="lead">Models, agents, knowledge and automation in one open, self-hostable workspace.</p>
      </header>
      <section className="modules">
        {modules.map(([name, description], index) => (
          <article key={name}><b>0{index + 1}</b><h2>{name}</h2><p>{description}</p></article>
        ))}
      </section>
      <section className="playground">
        <h2>{token ? 'Your workspace' : mode === 'register' ? 'Create your workspace' : 'Welcome back'}</h2>
        {token ? (
          <>
            <p>{user?.full_name ? `Signed in as ${user.full_name} (${user.email}).` : 'Your session is active in this browser session.'}</p>
            <button type="button" className="secondary" onClick={logout}>Sign out</button>
            <form onSubmit={sendPrompt}>
              <textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask Galdus.ai something…" required />
              <button disabled={busy}>{busy ? 'Sending…' : 'Send prompt'}</button>
            </form>
            {answer && <pre>{answer}</pre>}
          </>
        ) : (
          <>
            <p>{mode === 'register' ? 'Set up your personal or team workspace.' : 'Sign in to continue to your AI workspace.'}</p>
            <form onSubmit={authenticate}>
              {mode === 'register' && <>
                <input value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Full name" autoComplete="name" required maxLength={160} />
                <input value={organizationName} onChange={event => setOrganizationName(event.target.value)} placeholder="Workspace / organization name" required minLength={2} maxLength={160} />
              </>}
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email address" autoComplete="email" required />
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Password (at least 12 characters)" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 12 : 1} maxLength={128} />
              <button>{mode === 'register' ? 'Create account' : 'Sign in'}</button>
            </form>
            <p className="switch-mode">
              {mode === 'register' ? 'Already have an account?' : 'New to Galdus.ai?'}{' '}
              <button type="button" className="text-button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setAuthMessage(''); }}>
                {mode === 'register' ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </>
        )}
        {authMessage && <p role="status" className="status">{authMessage}</p>}
      </section>
      <footer>Early development · Not production-ready · AGPL-3.0-only</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
