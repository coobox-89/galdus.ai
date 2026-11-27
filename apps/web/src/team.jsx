import React, { useEffect, useState } from 'react';
import { BASE } from './paths';
import { useWs } from './workspace';
import { Select } from './select';
import { Avatar } from './profile';
import { PageHead, when } from './ui';

export function TeamPage() {
  const ws = useWs();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [audit, setAudit] = useState([]);
  const [settings, setSettings] = useState(null);
  const [invite, setInvite] = useState({ email: '', role: 'member' });
  const [link, setLink] = useState('');
  const load = () => {
    ws.call('/v1/org/members').then(setMembers).catch(ws.onError);
    ws.call('/v1/org/settings').then(setSettings).catch(ws.onError);
    if (ws.canManage) {
      ws.call('/v1/org/invitations').then(setInvites).catch(ws.onError);
      ws.call('/v1/org/audit?limit=50').then(setAudit).catch(ws.onError);
    }
  };
  useEffect(load, [ws.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(e) {
    e.preventDefault();
    try {
      const r = await ws.call('/v1/org/invitations', { method: 'POST', body: invite });
      setLink(`${window.location.origin}${BASE}/#/account?invite=${r.token}`);
      setInvite({ email: '', role: 'member' }); load();
    } catch (err) { ws.onError(err); }
  }
  async function setRole(m, role) {
    try { await ws.call(`/v1/org/members/${m.user_id}`, { method: 'PATCH', body: { role } }); ws.toast(`${m.full_name} is now ${role}.`); load(); } catch (err) { ws.onError(err); }
  }
  async function removeMember(m) {
    const self = m.user_id === ws.user.id;
    if (!window.confirm(self ? 'Leave this workspace?' : `Remove ${m.full_name} from the workspace?`)) return;
    try { await ws.call(`/v1/org/members/${m.user_id}`, { method: 'DELETE' }); ws.toast(self ? 'You left the workspace.' : 'Member removed.');
      if (self) ws.reloadOrganizations(); else load(); } catch (err) { ws.onError(err); }
  }
  async function revoke(i) {
    try { await ws.call(`/v1/org/invitations/${i.id}`, { method: 'DELETE' }); load(); } catch (err) { ws.onError(err); }
  }
  async function saveSettings(e) {
    e.preventDefault();
    try { setSettings(await ws.call('/v1/org/settings', { method: 'PUT', body: { name: settings.name, monthly_token_limit: Number(settings.monthly_token_limit) || 0,
      guardrails_enabled: settings.guardrails_enabled } })); ws.toast('Workspace settings saved.'); ws.reloadOrganizations(); } catch (err) { ws.onError(err); }
  }

  return (
    <div className="stack">
      <PageHead title="Team">Who can use this workspace, what they can change, and every sensitive action on record.</PageHead>
      <div className="panel">
        <div className="panel-head"><div><h3>Members</h3><p>Owners manage everything. Admins manage models, knowledge, agents and automations. Members use them.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th /></tr></thead>
          <tbody>{members.map(m => (
            <tr key={m.user_id}><td><span className="member"><Avatar user={m} size={28} />{m.full_name}</span></td><td>{m.email}</td>
              <td>{ws.isOwner && m.user_id !== ws.user.id ? (
                <Select compact value={m.role} onChange={v => setRole(m, v)} aria-label={`Role of ${m.full_name || m.email}`}
                  options={[{ value: 'owner', label: 'Owner' }, { value: 'admin', label: 'Admin' }, { value: 'member', label: 'Member' }]} />) : <span className="chip">{m.role}</span>}</td>
              <td>{when(m.joined_at)}</td>
              <td>{(ws.canManage || m.user_id === ws.user.id) && <button type="button" className="btn quiet sm" onClick={() => removeMember(m)}>{m.user_id === ws.user.id ? 'Leave' : 'Remove'}</button>}</td></tr>))}
          </tbody></table></div>
      </div>

      {ws.canManage && (
        <div className="panel form">
          <h3>Invite a teammate</h3>
          <form className="actions" onSubmit={send}>
            <input type="email" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} placeholder="name@company.com" required style={{ flex: 1, minWidth: 220 }} />
            <Select value={invite.role} onChange={v => setInvite({ ...invite, role: v })} aria-label="Role" options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Admin' }]} />
            <button className="btn">Create invitation</button>
          </form>
          {link && <div className="secret-box"><b>Send this link to your teammate</b><span className="small muted">It works once, for that email address, for 7 days. They sign up or sign in, then accept.</span>
            <code>{link}</code><div className="actions"><button type="button" className="btn sm" onClick={() => { navigator.clipboard?.writeText(link); ws.toast('Link copied.'); }}>Copy link</button>
              <button type="button" className="btn ghost sm" onClick={() => setLink('')}>Done</button></div></div>}
          {invites.length > 0 && <div className="table-wrap"><table><thead><tr><th>Pending</th><th>Role</th><th>Expires</th><th /></tr></thead>
            <tbody>{invites.map(i => <tr key={i.id}><td>{i.email}</td><td>{i.role}</td><td>{i.expired ? <span className="chip bad">expired</span> : when(i.expires_at)}</td>
              <td><button type="button" className="btn quiet sm" onClick={() => revoke(i)}>Revoke</button></td></tr>)}</tbody></table></div>}
        </div>)}

      {settings && (
        <form className="panel form" onSubmit={saveSettings}>
          <div className="panel-head"><div><h3>Workspace policies</h3><p>{new Intl.NumberFormat().format(settings.tokens_this_month)} tokens used this month.</p></div></div>
          <div className="form-grid">
            <label className="field">Workspace name<input value={settings.name} disabled={!ws.isOwner} onChange={e => setSettings({ ...settings, name: e.target.value })} required minLength={2} maxLength={160} /></label>
            <label className="field">Monthly token limit<small>0 means no limit. Applies to every model call in the workspace.</small>
              <input type="number" min="0" value={settings.monthly_token_limit} disabled={!ws.isOwner} onChange={e => setSettings({ ...settings, monthly_token_limit: e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={settings.guardrails_enabled} disabled={!ws.isOwner} onChange={e => setSettings({ ...settings, guardrails_enabled: e.target.checked })} />
            <span>Guardrails<small>Treat documents and tool results as data and neutralise likely prompt-injection attempts.</small></span></label>
          {ws.isOwner && <div><button className="btn">Save policies</button></div>}
        </form>)}

      {ws.canManage && (
        <div className="panel">
          <div className="panel-head"><div><h3>Audit log</h3><p>The last 50 sensitive actions in this workspace.</p></div></div>
          {audit.length === 0 ? <p className="muted" style={{ margin: 0 }}>No actions recorded yet.</p> : (
            <div className="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>{audit.map(e => <tr key={e.id}><td>{when(e.created_at)}</td><td>{e.actor || 'system'}</td><td>{e.action.replace(/[._]/g, ' ')}</td>
                <td className="muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{Object.entries(e.details || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')}</td></tr>)}</tbody></table></div>)}
        </div>)}
    </div>
  );
}
