import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Bot, Plug, Server, ShieldCheck } from 'lucide-react';
import { useWs } from './workspace';
import { Done, HowTo, WizardFrame } from './wizardkit';
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
  const [tools, setTools] = useState({ id: '', list: null, busy: false });
  const [wizard, setWizard] = useState(false);
  const load = () => ws.call('/v1/integrations/mcp').then(setServers).catch(ws.onError);
  useEffect(() => { load(); ws.call('/v1/integrations/builtin-tools').then(setBuiltins).catch(() => {}); }, [ws.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <AnimatePresence>{wizard && <McpWizard key="mcp" onClose={() => { setWizard(false); load(); }} />}</AnimatePresence>
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
        {ws.canManage && <div style={{ marginTop: servers.length ? 18 : 0 }}><button type="button" className="btn" onClick={() => setWizard(true)}><Plug size={16} /> Add MCP server</button></div>}
        {!servers.length && <p className="small muted" style={{ marginTop: 10 }}>No MCP server yet. Add one to let agents read tickets, query a database or act in your tools.</p>}
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

function McpIllo() {
  const reduce = useReducedMotion();
  const node = (x, label, Icon) => (
    <g transform={`translate(${x} 44)`}>
      <rect x="-46" y="-30" width="92" height="60" rx="14" fill="#0E2547" stroke="rgba(182,255,0,.45)" />
      <foreignObject x="-12" y="-22" width="24" height="24"><Icon size={22} color="#B6FF00" /></foreignObject>
      <text x="0" y="20" textAnchor="middle" fontSize="11" fontWeight="600" fill="#F8FAFC" fontFamily="Montserrat, sans-serif">{label}</text>
    </g>);
  return (
    <svg viewBox="0 0 360 96" className="wz-illo small" role="img" aria-label="Agent calls the MCP server, which acts in your tool">
      {[[100, 130], [230, 260]].map(([x1, x2], i) => (
        <g key={i}><line x1={x1} y1="44" x2={x2} y2="44" stroke="rgba(248,250,252,.25)" strokeWidth="2" strokeDasharray="4 5" />
          {!reduce && <motion.circle r="4" cy="44" fill="#B6FF00" initial={{ cx: x1 }} animate={{ cx: [x1, x2, x1] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * .6 }} />}</g>))}
      {node(54, 'Agent', Bot)}{node(180, 'MCP server', Server)}{node(306, 'Your tool', Plug)}
    </svg>);
}

function McpWizard({ onClose }) {
  const ws = useWs();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', url: '', authorization: '' });
  const [server, setServer] = useState(null);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true); setError('');
    try {
      const s = server || await ws.call('/v1/integrations/mcp', { method: 'POST', body: { ...form, authorization: form.authorization || null } });
      setServer(s);
      const tools = await ws.call(`/v1/integrations/mcp/${s.id}/tools`);
      setList(tools.map(t => ({ ...t, allowed: !/delete|remove|drop|write|update|create|send/i.test(t.name) })));
      setStep(2);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function cancel() {
    if (server && step < 3 && window.confirm('Remove the server you just added?')) {
      try { await ws.call(`/v1/integrations/mcp/${server.id}`, { method: 'DELETE' }); } catch { /* ignore */ }
    }
    onClose();
  }
  async function save() {
    setBusy(true);
    try { await ws.call(`/v1/integrations/mcp/${server.id}/allowed-tools`, { method: 'PUT', body: { allowed_tools: list.filter(t => t.allowed).map(t => t.name) } }); setStep(3); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const valid = form.name.trim() && /^https:\/\//.test(form.url.trim());
  const footer = (
    <>
      {step > 0 && step < 3 ? <button type="button" className="btn quiet" onClick={() => { setStep(s => s - 1); setError(''); }}><ArrowLeft size={15} /> Back</button> : <span />}
      {step === 0 && <button type="button" className="btn" onClick={() => setStep(1)}>Start <ArrowRight size={15} /></button>}
      {step === 1 && <button type="button" className="btn" disabled={!valid || busy} onClick={connect}>{busy ? 'Connecting…' : 'Connect and list tools'}</button>}
      {step === 2 && <button type="button" className="btn" disabled={busy} onClick={save}>Allow {list?.filter(t => t.allowed).length || 0} tools</button>}
      {step === 3 && <button type="button" className="btn" onClick={onClose}>Done</button>}
    </>);
  return (
    <WizardFrame icon={<Plug size={18} />} title="Add an MCP server" subtitle="Give agents safe access to a company tool." steps={['About', 'Connect', 'Tools', 'Ready']} step={step} onClose={cancel} footer={footer}>
      {step === 0 && <div className="wz-form">
        <McpIllo />
        <HowTo steps={[
          'An MCP server exposes actions of one of your tools (tickets, CRM, a database) in a standard way.',
          'You need its public https address and, if it asks for one, an access token.',
          'You then choose exactly which tools agents may call. Every call is recorded on the run.',
        ]} />
        <p className="wz-note"><ShieldCheck size={15} />Start read-only: allow actions that change data only when you trust the agent.</p>
      </div>}
      {step === 1 && <div className="wz-form">
        <div className="form-grid">
          <label className="field">Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Helpdesk" autoFocus /></label>
          <label className="field">Server address<small>Streamable HTTP endpoint over https.</small>
            <input type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://mcp.example.com/mcp" /></label>
        </div>
        <label className="field">Authorization header<small>Optional, for example Bearer followed by the token. Stored encrypted.</small>
          <input type="password" autoComplete="off" value={form.authorization} onChange={e => setForm({ ...form, authorization: e.target.value })} maxLength={2000} /></label>
        {error && <div className="wz-error"><b>The server did not answer as expected</b><span>{error}</span><small>Check the address ends with the MCP path (often /mcp), that it is public and that the token is valid.</small></div>}
      </div>}
      {step === 2 && list && <div className="wz-form">
        <p className="muted small" style={{ margin: 0 }}>{list.length ? `${form.name} offers ${list.length} tools. Actions that look like they change data start switched off.` : 'This server exposes no tools yet.'}</p>
        <div className="stack" style={{ gap: 8 }}>{list.map((t, i) => (
          <label key={t.name} className="check"><input type="checkbox" checked={t.allowed} onChange={() => setList(v => v.map((x, j) => j === i ? { ...x, allowed: !x.allowed } : x))} />
            <span>{t.name}<small>{t.description}</small></span></label>))}</div>
        {error && <div className="wz-error"><b>Could not save</b><span>{error}</span></div>}
      </div>}
      {step === 3 && <Done title={`${form.name} is ready`}><p className="muted">Agents can now call the tools you allowed. Pick them when you edit an agent.</p></Done>}
    </WizardFrame>
  );
}
