import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const fmt = n => new Intl.NumberFormat('en').format(n ?? 0);
const when = iso => (iso ? new Date(iso).toLocaleString() : '—');

export function AdminConsole({ token, currentUserId, onError }) {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [usage, setUsage] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, u, g, s] = await Promise.all([
        api('/v1/admin/overview', { token }),
        api('/v1/admin/users', { token }),
        api('/v1/admin/organizations', { token }),
        api('/v1/admin/usage?days=14', { token }),
      ]);
      setOverview(o); setUsers(u); setOrgs(g); setUsage(s);
    } catch (err) { onError(err); } finally { setLoading(false); }
  }, [token, onError]);

  useEffect(() => { load(); }, [load]);

  async function toggleAdmin(user) {
    try {
      await api(`/v1/admin/users/${user.id}/admin`, { token, method: 'POST', body: { is_platform_admin: !user.is_platform_admin } });
      load();
    } catch (err) { onError(err); }
  }

  if (!overview) return <p>{loading ? 'Loading admin console…' : 'Admin data unavailable.'}</p>;

  const tiles = [
    ['Users', overview.users], ['Organizations', overview.organizations], ['New users · 7d', overview.new_users_7d],
    ['Requests · 24h', overview.requests_24h], ['Tokens · 24h', overview.tokens_24h], ['Tokens · total', overview.tokens_total],
  ];
  const c = overview.config;

  return (
    <div className="admin">
      <div className="row admin-head"><h3>Platform overview</h3><button type="button" className="secondary" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      <div className="tiles">{tiles.map(([label, value]) => <div key={label} className="tile"><small>{label}</small><b>{fmt(value)}</b></div>)}</div>

      <h3>Configuration</h3>
      <dl className="config">
        <div><dt>Environment</dt><dd>{c.environment}</dd></div>
        <div><dt>Default model</dt><dd>{c.default_model}</dd></div>
        <div><dt>Allowed models</dt><dd>{c.allowed_models.join(', ')}</dd></div>
        <div><dt>Daily token budget / user</dt><dd>{c.daily_token_budget_per_user ? fmt(c.daily_token_budget_per_user) : 'unlimited'}</dd></div>
        <div><dt>Auth rate limit</dt><dd>{c.rate_limit_auth_per_minute} / min / IP</dd></div>
        <div><dt>Chat rate limit</dt><dd>{c.rate_limit_chat_per_minute} / min / user</dd></div>
      </dl>

      <h3>Users</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Workspaces</th><th>Tokens 24h</th><th>Last request</th><th>Joined</th><th>Admin</th></tr></thead>
        <tbody>{users.map(u => (
          <tr key={u.id}>
            <td>{u.full_name}</td><td>{u.email}</td><td>{u.organizations}</td><td>{fmt(u.tokens_24h)}</td>
            <td>{when(u.last_request_at)}</td><td>{when(u.created_at)}</td>
            <td><button type="button" className="text-button" disabled={u.id === currentUserId} onClick={() => toggleAdmin(u)}>{u.is_platform_admin ? 'Admin · revoke' : 'Make admin'}</button></td>
          </tr>))}</tbody>
      </table></div>

      <h3>Organizations</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Slug</th><th>Members</th><th>Tokens total</th><th>Created</th></tr></thead>
        <tbody>{orgs.map(o => <tr key={o.id}><td>{o.name}</td><td>{o.slug}</td><td>{o.members}</td><td>{fmt(o.tokens_total)}</td><td>{when(o.created_at)}</td></tr>)}</tbody>
      </table></div>

      <h3>Usage · last 14 days</h3>
      {usage.length === 0 ? <p className="empty">No model requests yet.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Day</th><th>Model</th><th>Requests</th><th>Tokens</th></tr></thead>
          <tbody>{usage.map(r => <tr key={r.day + r.model}><td>{r.day}</td><td>{r.model}</td><td>{fmt(r.requests)}</td><td>{fmt(r.tokens)}</td></tr>)}</tbody>
        </table></div>)}
    </div>
  );
}
