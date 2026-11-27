import React, { useEffect, useState } from 'react';
import { Download, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import { useWs } from './workspace';
import { PageHead } from './ui';

const STYLES = [['concise', 'Concise', 'Short answers, straight to the point.'], ['balanced', 'Balanced', 'The answer first, then what matters.'],
  ['detailed', 'Detailed', 'Thorough answers with steps and examples.']];

export function AccountPage({ go }) {
  const ws = useWs();
  const token = new URLSearchParams(window.location.hash.split('?')[1] || '').get('invite');
  const [prefs, setPrefs] = useState(null);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [del, setDel] = useState('');
  useEffect(() => { ws.call('/v1/auth/preferences').then(setPrefs).catch(ws.onError); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function accept() {
    try {
      const r = await ws.call('/v1/invitations/accept', { method: 'POST', body: { token } });
      ws.toast(`You joined ${r.name}.`); await ws.reloadOrganizations(); ws.setOrganizationId(r.organization_id); go('home');
    } catch (err) { ws.onError(err); }
  }
  async function savePrefs(e) {
    e.preventDefault();
    try { setPrefs(await ws.call('/v1/auth/preferences', { method: 'PUT', body: prefs })); ws.toast('Preferences saved. New messages use them.'); } catch (err) { ws.onError(err); }
  }
  async function changePw(e) {
    e.preventDefault();
    try { const r = await ws.call('/v1/auth/password/change', { method: 'POST', body: { ...pw, current_password: pw.current_password || null } });
      setPw({ current_password: '', new_password: '' }); setPrefs(p => ({ ...p, has_password: true }));
      if (r.access_token) ws.onToken?.(r);
      ws.toast('Password updated. Other devices were signed out.'); } catch (err) { ws.onError(err); }
  }
  async function signOutEverywhere() {
    if (!window.confirm('Sign out of Galdus on every device, including this one?')) return;
    try { await ws.call('/v1/auth/logout-all', { method: 'POST' }); ws.onSignOut?.('You were signed out on every device.'); } catch (err) { ws.onError(err); }
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
    try { await ws.call('/v1/auth/account/delete', { method: 'POST', body: { password: del } }); window.location.hash = ''; window.location.reload(); }
    catch (err) { ws.toast(err.message, 'error'); setDel(''); }
  }

  return (
    <div className="stack">
      <PageHead title="Account">{ws.user.full_name}, {ws.user.email}</PageHead>
      {token && (
        <div className="secret-box"><b>You have been invited to a workspace</b>
          <span className="small muted">Accept to join it with the role chosen by the person who invited you.</span>
          <div><button type="button" className="btn" onClick={accept}>Accept invitation</button></div></div>)}
      {prefs && (
        <form className="panel form" onSubmit={savePrefs}>
          <div className="panel-head"><div><h2 style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Sparkles size={20} color="#B6FF00" /> Personalise your chat</h2>
            <p>Galdus adds this to every conversation, so answers fit you without repeating yourself.</p></div></div>
          <label className="field">Your name<input value={prefs.full_name} onChange={e => setPrefs({ ...prefs, full_name: e.target.value })} required maxLength={160} /></label>
          <label className="field">What should Galdus know about you?
            <small>Your role, company, tools you use, languages, things to avoid.</small>
            <textarea value={prefs.custom_instructions} onChange={e => setPrefs({ ...prefs, custom_instructions: e.target.value })} maxLength={4000}
              placeholder="I manage a data center operations team in Milan. We use VMware, AWS and HaloITSM. Reply in Italian unless I write in English." />
          </label>
          <div className="field">How should it answer?
            <div className="persona-grid">{STYLES.map(([id, name, d]) => (
              <button key={id} type="button" className={`persona ${prefs.response_style === id ? 'active' : ''}`} onClick={() => setPrefs({ ...prefs, response_style: id })}>
                <b>{name}</b><small>{d}</small></button>))}</div>
          </div>
          <div><button className="btn">Save preferences</button></div>
        </form>)}
      <div className="cols">
        {prefs && (
          <form className="panel form" onSubmit={changePw}>
            <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><KeyRound size={17} /> {prefs.has_password ? 'Change password' : 'Set a password'}</h3>
            {prefs.linked_providers.length > 0 && <p className="small muted" style={{ margin: 0 }}>Signed in with {prefs.linked_providers.join(' and ')}.{!prefs.has_password && ' Add a password to also sign in with email.'}</p>}
            {prefs.has_password && <label className="field">Current password<input type="password" value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" required /></label>}
            <label className="field">New password<small>At least 12 characters.</small><input type="password" value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" required minLength={12} maxLength={128} /></label>
            <div><button className="btn ghost">{prefs.has_password ? 'Change password' : 'Set password'}</button></div>
          </form>)}
        <div className="stack">
          <div className="panel form"><h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Download size={17} /> Your data</h3>
            <p className="muted small" style={{ margin: 0 }}>Download everything Galdus stores about you: profile, workspaces and usage records.</p>
            <div><button type="button" className="btn ghost" onClick={exportData}>Download my data</button></div></div>
          <div className="panel form"><h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><KeyRound size={17} /> Sessions</h3>
            <p className="muted small" style={{ margin: 0 }}>Lost a device or signed in on a shared computer? End every session at once.</p>
            <div><button type="button" className="btn ghost" onClick={signOutEverywhere}>Sign out everywhere</button></div></div>
          <form className="panel form" onSubmit={remove}><h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Trash2 size={17} /> Delete account</h3>
            <p className="muted small" style={{ margin: 0 }}>This cannot be undone. Workspaces you share with others stay with them.</p>
            {prefs?.has_password !== false && <label className="field">Confirm with your password<input type="password" value={del} onChange={e => setDel(e.target.value)} autoComplete="current-password" required maxLength={128} /></label>}
            {prefs?.has_password === false ? <p className="small muted" style={{ margin: 0 }}>Set a password first to confirm deletion.</p> : <div><button className="btn danger">Delete my account</button></div>}
          </form>
        </div>
      </div>
    </div>
  );
}
