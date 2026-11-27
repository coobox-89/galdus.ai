import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { api } from './api';
import { Landing } from './landing';
import { AcceptableUse, Privacy, Terms } from './legal';
import { currentRoute } from './paths';
import { Shell } from './shell';
import { ToastProvider, useToast } from './ui';
import { WorkspaceProvider } from './workspace';
import './style.css';

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

function App() {
  const toast = useToast();
  const [token, setToken] = useState(loadToken);
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState('');

  const clear = useCallback(note => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    setToken(''); setUser(null);
    if (note) toast(note, 'warn');
  }, [toast]);
  const expire = useCallback(() => clear('Your session expired. Sign in again to continue.'), [clear]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    api('/v1/auth/me', { token }).then(d => { if (active) setUser(d); })
      .catch(err => { if (active) (err.status === 401 ? expire() : setMessage(err.message)); });
    const expiresAt = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    const t = expiresAt ? setTimeout(expire, Math.max(0, expiresAt - Date.now())) : undefined;
    return () => { active = false; clearTimeout(t); };
  }, [token, expire]);

  function onAuthenticated(data) {
    sessionStorage.setItem(TOKEN_KEY, data.access_token);
    sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + data.expires_in * 1000));
    setUser(data.user);
    setToken(data.access_token);
  }

  if (!token) return <Landing onAuthenticated={onAuthenticated} message={message} setMessage={setMessage} />;
  if (!user) return null;
  return (
    <WorkspaceProvider token={token} user={user} onExpired={expire}>
      <Shell onLogout={note => clear(typeof note === 'string' ? note : '')} />
    </WorkspaceProvider>
  );
}

const legal = { '/privacy': Privacy, '/terms': Terms, '/acceptable-use': AcceptableUse };

function Root() {
  const Legal = legal[currentRoute()];
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>{Legal ? <Legal /> : <App />}</ToastProvider>
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
