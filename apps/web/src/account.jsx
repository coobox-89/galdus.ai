import React, { useEffect, useState } from 'react';
import { useWs } from './workspace';
import { PageHead } from './ui';

export function AccountPage({ go }) {
  const ws = useWs();
  const [password, setPassword] = useState('');
  const token = new URLSearchParams(window.location.hash.split('?')[1] || '').get('invite');
  const [accepted, setAccepted] = useState(null);

  async function accept() {
    try {
      const r = await ws.call('/v1/invitations/accept', { method: 'POST', body: { token } });
      setAccepted(r); ws.toast(`You joined ${r.name}.`); await ws.reloadOrganizations(); ws.setOrganizationId(r.organization_id);
      window.location.hash = '/home';
    } catch (err) { ws.onError(err); }
  }
  async function exportData() {
    try {
      const data = await ws.call('/v1/auth/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      Object.assign(document.createElement('a'), { href: url, download: 'galdus-account-export.json' }).click();
      URL.revokeObjectURL(url);
    } catch (err) { ws.onError(err); }
  }
  async function remove(e) {
    e.preventDefault();
    if (!window.confirm('Delete your account permanently? Workspaces where you are the only member are deleted too.')) return;
    try { await ws.call('/v1/auth/account/delete', { method: 'POST', body: { password } }); window.location.hash = ''; window.location.reload(); }
    catch (err) { ws.toast(err.message, 'error'); setPassword(''); }
  }
  useEffect(() => { if (accepted) go('home'); }, [accepted, go]);

  return (
    <div className="stack">
      <PageHead title="Account">{ws.user.full_name}, {ws.user.email}</PageHead>
      {token && !accepted && (
        <div className="secret-box"><b>You have been invited to a workspace</b>
          <span className="small muted">Accept to join it with the role chosen by the person who invited you.</span>
          <div><button type="button" className="btn" onClick={accept}>Accept invitation</button></div></div>)}
      <div className="cols">
        <div className="panel form"><h3>Your data</h3>
          <p className="muted small" style={{ margin: 0 }}>Download everything Galdus stores about you: profile, workspaces and usage records. Chat messages are not stored.</p>
          <div><button type="button" className="btn ghost" onClick={exportData}>Download my data</button></div></div>
        <form className="panel form" onSubmit={remove}><h3>Delete account</h3>
          <p className="muted small" style={{ margin: 0 }}>This cannot be undone. Workspaces you share with others stay with them.</p>
          <label className="field">Confirm with your password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required maxLength={128} /></label>
          <div><button className="btn danger">Delete my account</button></div></form>
      </div>
    </div>
  );
}
