import React, { useEffect, useState } from 'react';
import { useWs } from './workspace';
import { CloudDrives } from './drives';
import { PageHead, Pixels } from './ui';

const ROADMAP = [
  ['Slack and Microsoft Teams', 'Deliver automation results today via incoming webhooks. Two-way bots are planned.', 'Available'],
  ['n8n, Make, Zapier', 'Trigger agents from any workflow with an automation webhook.', 'Available'],
  ['Web pages', 'Import public pages into knowledge, or let agents read them with the web tool.', 'Available'],
  ['Google Drive, SharePoint, OneDrive', 'Import documents into knowledge, re-synced daily.', 'Available'],
  ['Sign in with Google and GitHub', 'One-click sign-in once the platform owner adds the OAuth apps.', 'Available'],
  ['Microsoft Entra ID single sign-on', 'Company sign-in with your Microsoft tenant.', 'Planned'],
  ['Databases', 'Let agents query PostgreSQL or SQL Server read-only, through MCP today.', 'Via MCP'],
];

export function IntegrationsPage() {
  const ws = useWs();
  const [servers, setServers] = useState([]);
  const [builtins, setBuiltins] = useState([]);
  const [form, setForm] = useState({ name: '', url: '', authorization: '' });
  const [tools, setTools] = useState({ id: '', list: null, busy: false });
  const load = () => ws.call('/v1/integrations/mcp').then(setServers).catch(ws.onError);
  useEffect(() => { load(); ws.call('/v1/integrations/builtin-tools').then(setBuiltins).catch(() => {}); }, [ws.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e.preventDefault();
    try { await ws.call('/v1/integrations/mcp', { method: 'POST', body: { ...form, authorization: form.authorization || null } });
      setForm({ name: '', url: '', authorization: '' }); ws.toast('MCP server added. Choose which tools agents may use.'); load(); } catch (err) { ws.onError(err); }
  }
  async function discover(s) {
    setTools({ id: s.id, list: null, busy: true });
    try { setTools({ id: s.id, list: await ws.call(`/v1/integrations/mcp/${s.id}/tools`), busy: false }); }
    catch (err) { setTools({ id: '', list: null, busy: false }); ws.onError(err); }
  }
  async function saveAllowed(s) {
    const allowed = tools.list.filter(t => t.allowed).map(t => t.name);
    try { await ws.call(`/v1/integrations/mcp/${s.id}/allowed-tools`, { method: 'PUT', body: { allowed_tools: allowed } }); ws.toast('Tool permissions saved.'); load(); } catch (err) { ws.onError(err); }
  }
  async function remove(s) {
    if (!window.confirm(`Remove "${s.name}"? Agents lose access to its tools.`)) return;
    try { await ws.call(`/v1/integrations/mcp/${s.id}`, { method: 'DELETE' }); load(); } catch (err) { ws.onError(err); }
  }

  return (
    <div className="stack">
      <PageHead title="Integrations">Connect your company tools to agents with the Model Context Protocol, and plug Galdus into the workflows you already use.</PageHead>
      <CloudDrives />
      <div className="panel">
        <div className="panel-head"><div><h3>MCP servers</h3><p>Agents can only call tools you explicitly allow. Every call is recorded on the run.</p></div></div>
        <div className="stack">{servers.map(s => (
          <div key={s.id} className="run" style={{ background: 'var(--night-deep)' }}>
            <div className="run-head"><div><b>{s.name}</b><div className="small muted">{s.url}{s.has_auth ? ', authenticated' : ''}</div></div>
              <div className="actions"><span className="chip">{s.allowed_tools.length} allowed</span>
                <button type="button" className="btn ghost sm" onClick={() => discover(s)}>Manage tools</button>
                {ws.canManage && <button type="button" className="btn quiet sm" onClick={() => remove(s)}>Remove</button>}</div></div>
            {tools.id === s.id && (tools.busy ? <Pixels label="Connecting" /> : tools.list && <>
              {tools.list.length === 0 && <p className="small muted">This server exposes no tools.</p>}
              {tools.list.map((t, i) => (
                <label key={t.name} className="check"><input type="checkbox" checked={t.allowed} disabled={!ws.canManage}
                  onChange={() => setTools(v => ({ ...v, list: v.list.map((x, j) => j === i ? { ...x, allowed: !x.allowed } : x) }))} />
                  <span>{t.name}<small>{t.description}</small></span></label>))}
              {ws.canManage && tools.list.length > 0 && <div><button type="button" className="btn sm" onClick={() => saveAllowed(s)}>Save permissions</button></div>}
            </>)}
          </div>))}</div>
        {ws.canManage && (
          <form className="form" onSubmit={add} style={{ marginTop: servers.length ? 18 : 0 }}>
            <div className="form-grid">
              <label className="field">Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={80} placeholder="Helpdesk" /></label>
              <label className="field">Server address<small>Streamable HTTP endpoint over https.</small><input type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} required placeholder="https://mcp.example.com/mcp" /></label>
              <label className="field span">Authorization header (optional)<small>For example Bearer &lt;token&gt;. Stored encrypted.</small>
                <input type="password" autoComplete="off" value={form.authorization} onChange={e => setForm({ ...form, authorization: e.target.value })} maxLength={2000} /></label>
            </div>
            <div><button className="btn">Add MCP server</button></div>
          </form>)}
      </div>
      <div className="cols">
        <div className="panel"><h3>Built-in tools</h3><p className="small muted">Available to every agent, no setup needed.</p>
          <div className="stack" style={{ gap: 10 }}>{builtins.map(t => <div key={t.id} className="small"><b>{t.id.replace('_', ' ')}</b><br /><span className="muted">{t.description}</span></div>)}</div></div>
        <div className="panel"><h3>Connectors</h3><p className="small muted">What works today and what is coming next.</p>
          <div className="stack" style={{ gap: 12 }}>{ROADMAP.map(([n, d, s]) => (
            <div key={n} className="small" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
              <div><b>{n}</b><br /><span className="muted">{d}</span></div><span className={`chip ${s === 'Planned' ? 'warn' : 'ok'}`}>{s}</span></div>))}</div></div>
      </div>
    </div>
  );
}
