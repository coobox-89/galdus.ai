import React, { useCallback, useEffect, useState } from 'react';
import { useWs } from './workspace';
import { fmt, PageHead, when } from './ui';

export function AdminPage() {
  const ws = useWs();
  const [d, setD] = useState(null);
  const load = useCallback(async () => {
    try {
      const [overview, users, orgs, usage] = await Promise.all(['overview', 'users', 'organizations', 'usage?days=14'].map(p => ws.call(`/v1/admin/${p}`)));
      setD({ overview, users, orgs, usage });
    } catch (err) { ws.onError(err); }
  }, [ws]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function toggleAdmin(u) {
    try { await ws.call(`/v1/admin/users/${u.id}/admin`, { method: 'POST', body: { is_platform_admin: !u.is_platform_admin } }); load(); } catch (err) { ws.onError(err); }
  }
  if (!d) return <PageHead title="Platform admin">Loading…</PageHead>;
  const o = d.overview;
  const tiles = [['Users', o.users], ['Workspaces', o.organizations], ['New users, 7 days', o.new_users_7d], ['Requests, 24 h', o.requests_24h], ['Tokens, 24 h', o.tokens_24h], ['Tokens, all time', o.tokens_total]];
  return (
    <div className="stack">
      <PageHead title="Platform admin" actions={<button type="button" className="btn ghost" onClick={load}>Refresh</button>}>Every workspace on this Galdus installation. Visible to platform administrators only.</PageHead>
      <div className="cols-3">{tiles.map(([l, v]) => <div key={l} className="stat"><small>{l}</small><b>{fmt(v)}</b></div>)}</div>
      <div className="panel"><h3 style={{ marginBottom: 12 }}>Users</h3><div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Workspaces</th><th>Tokens 24 h</th><th>Last request</th><th>Joined</th><th>Admin</th></tr></thead>
        <tbody>{d.users.map(u => <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.organizations}</td><td className="num">{fmt(u.tokens_24h)}</td>
          <td>{when(u.last_request_at)}</td><td>{when(u.created_at)}</td>
          <td><button type="button" className="btn quiet sm" disabled={u.id === ws.user.id} onClick={() => toggleAdmin(u)}>{u.is_platform_admin ? 'Revoke admin' : 'Make admin'}</button></td></tr>)}</tbody></table></div></div>
      <div className="cols">
        <div className="panel"><h3 style={{ marginBottom: 12 }}>Workspaces</h3><div className="table-wrap"><table><thead><tr><th>Name</th><th>Members</th><th>Tokens</th></tr></thead>
          <tbody>{d.orgs.map(g => <tr key={g.id}><td>{g.name}</td><td>{g.members}</td><td className="num">{fmt(g.tokens_total)}</td></tr>)}</tbody></table></div></div>
        <div className="panel"><h3 style={{ marginBottom: 12 }}>Usage, 14 days</h3>{d.usage.length === 0 ? <p className="muted">No requests yet.</p> : <div className="table-wrap"><table>
          <thead><tr><th>Day</th><th>Model</th><th>Requests</th><th>Tokens</th></tr></thead>
          <tbody>{d.usage.map(r => <tr key={r.day + r.model}><td>{r.day}</td><td>{r.model}</td><td className="num">{r.requests}</td><td className="num">{fmt(r.tokens)}</td></tr>)}</tbody></table></div>}</div>
      </div>
    </div>
  );
}
