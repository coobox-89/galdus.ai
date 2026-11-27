import React, { useCallback, useEffect, useState } from 'react';
import { ModelPicker } from './modelpicker';
import { RunView } from './runview';
import { useWs } from './workspace';
import { Bot } from 'lucide-react';
import { Empty, PageHead, Pixels, plural, Status, when } from './ui';

const EMPTY = { name: '', description: '', instructions: '', collection_id: '', tools: [], mcp_server_ids: [] };

export function AgentsPage({ go }) {
  const ws = useWs();
  const [agents, setAgents] = useState([]);
  const [builtins, setBuiltins] = useState([]);
  const [mcp, setMcp] = useState([]);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState(null);
  const [model, setModel] = useState({ connectionId: '', model: '' });
  const [input, setInput] = useState('');
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const pick = useCallback(v => setModel(v), []);
  const agent = agents.find(a => a.id === selected);

  const load = useCallback(() => ws.call('/v1/agents').then(list => { setAgents(list); setSelected(s => s || list[0]?.id || ''); })
    .catch(ws.onError), [ws]);
  useEffect(() => {
    load();
    ws.call('/v1/integrations/builtin-tools').then(setBuiltins).catch(() => {});
    ws.call('/v1/integrations/mcp').then(setMcp).catch(() => {});
  }, [ws.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected) ws.call(`/v1/runs?agent_id=${selected}&limit=10`).then(setHistory).catch(ws.onError); }, [selected, run]); // eslint-disable-line react-hooks/exhaustive-deps

  function edit(a) {
    setEditing(a ? { ...a, collection_id: a.collection_id || '' } : { ...EMPTY });
    setModel(a ? { connectionId: a.connection_id || '', model: a.model } : { connectionId: '', model: '' });
  }
  const toggle = (key, id) => setEditing(e => ({ ...e, [key]: e[key].includes(id) ? e[key].filter(x => x !== id) : [...e[key], id] }));

  async function save(e) {
    e.preventDefault();
    try {
      const body = { name: editing.name, description: editing.description, instructions: editing.instructions, tools: editing.tools,
        mcp_server_ids: editing.mcp_server_ids, collection_id: editing.collection_id || null, connection_id: model.connectionId || null, model: model.model };
      const saved = editing.id ? await ws.call(`/v1/agents/${editing.id}`, { method: 'PUT', body }) : await ws.call('/v1/agents', { method: 'POST', body });
      ws.toast(editing.id ? 'Agent saved.' : 'Agent created.');
      setEditing(null); setSelected(saved.id); load();
    } catch (err) { ws.onError(err); }
  }
  async function remove() {
    if (!window.confirm(`Delete the agent "${agent.name}"? Its run history stays.`)) return;
    try { await ws.call(`/v1/agents/${agent.id}`, { method: 'DELETE' }); ws.toast('Agent deleted.'); setSelected(''); load(); } catch (err) { ws.onError(err); }
  }
  async function execute(e) {
    e.preventDefault();
    setBusy(true); setRun(null);
    try { setRun(await ws.call(`/v1/agents/${agent.id}/runs`, { method: 'POST', body: { input } })); } catch (err) { ws.onError(err); } finally { setBusy(false); }
  }

  if (editing) return (
    <form className="stack" onSubmit={save}>
      <PageHead title={editing.id ? `Edit ${editing.name}` : 'New agent'}>An agent is a reusable assistant with its own instructions, model, knowledge and tools.</PageHead>
      <div className="panel form">
        <div className="form-grid">
          <label className="field">Name<input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} required maxLength={120} placeholder="Service desk assistant" /></label>
          <label className="field">What it does<input value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} maxLength={500} placeholder="Answers IT questions from our runbooks" /></label>
        </div>
        <label className="field">Instructions<small>How the agent should behave, its tone and its limits.</small>
          <textarea value={editing.instructions} onChange={e => setEditing({ ...editing, instructions: e.target.value })} required maxLength={20000}
            placeholder="You are the first-line IT assistant for our company. Answer in Italian, step by step. If unsure, say so and suggest opening a ticket." style={{ minHeight: 160 }} />
        </label>
        <ModelPicker value={model} onChange={pick} go={go} />
      </div>
      <div className="cols">
        <div className="panel form">
          <h3>Knowledge</h3>
          <label className="field">Answer from this collection
            <select value={editing.collection_id} onChange={e => setEditing({ ...editing, collection_id: e.target.value })}>
              <option value="">No knowledge</option>
              {ws.collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="panel form">
          <h3>Tools</h3>
          {builtins.map(t => (
            <label key={t.id} className="check"><input type="checkbox" checked={editing.tools.includes(t.id)} onChange={() => toggle('tools', t.id)} />
              <span>{t.id.replace('_', ' ')}<small>{t.description}</small></span></label>))}
          {mcp.map(s => (
            <label key={s.id} className="check"><input type="checkbox" checked={editing.mcp_server_ids.includes(s.id)} onChange={() => toggle('mcp_server_ids', s.id)} />
              <span>{s.name} (MCP)<small>{s.allowed_tools.length ? `${s.allowed_tools.length} allowed tools` : 'No tools allowed yet'}</small></span></label>))}
          {mcp.length === 0 && <p className="small muted" style={{ margin: 0 }}>Connect MCP servers in <button type="button" className="linkish" onClick={() => go('integrations')}>Integrations</button> to give agents your company tools.</p>}
        </div>
      </div>
      <div className="actions"><button className="btn" disabled={!model.model}>{editing.id ? 'Save agent' : 'Create agent'}</button>
        <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>
  );

  return (
    <div className="stack">
      <PageHead title="Agents" actions={ws.canManage && <button type="button" className="btn" onClick={() => edit(null)}>New agent</button>}>
        Reusable assistants with their own instructions, knowledge and tools. Every run is saved with its sources.
      </PageHead>
      {agents.length === 0 ? (
        <Empty title="No agents yet" action={ws.canManage && <button type="button" className="btn" onClick={() => edit(null)}>Create your first agent</button>}>
          Start with something concrete, like an assistant that answers from your IT runbooks.</Empty>
      ) : <>
        <div className="tiles">{agents.map(a => (
          <button key={a.id} type="button" className={`tile ${a.id === selected ? 'active' : ''}`} onClick={() => { setSelected(a.id); setRun(null); }}>
            <span className="ico"><Bot size={18} /></span><b>{a.name}</b><small>{a.description || a.instructions.slice(0, 90)}</small>
            <span className="meta"><span className="chip">{a.model}</span>{a.collection_id && <span className="chip">Knowledge</span>}
              {(a.tools.length + a.mcp_server_ids.length) > 0 && <span className="chip">{plural(a.tools.length + a.mcp_server_ids.length, 'tool')}</span>}</span>
          </button>))}
        </div>
        {agent && (
          <div className="panel form">
            <div className="panel-head"><div><h2>{agent.name}</h2><p>{agent.description}</p></div>
              {ws.canManage && <div className="actions"><button type="button" className="btn ghost sm" onClick={() => edit(agent)}>Edit</button>
                <button type="button" className="btn danger sm" onClick={remove}>Delete</button></div>}</div>
            <form className="form" onSubmit={execute}>
              <textarea value={input} onChange={e => setInput(e.target.value)} placeholder={`Ask ${agent.name}…`} required maxLength={50000} />
              <div className="actions"><button className="btn" disabled={busy}>Run agent</button>{busy && <Pixels />}</div>
            </form>
            <RunView run={run} />
            {history.length > 0 && <>
              <h3>Recent runs</h3>
              <div className="table-wrap"><table><thead><tr><th>When</th><th>Trigger</th><th>Request</th><th>Status</th></tr></thead>
                <tbody>{history.map(r => <tr key={r.id} className="clickable" onClick={() => setRun(r)}><td>{when(r.created_at)}</td><td>{r.trigger}</td>
                  <td>{r.input.slice(0, 60)}</td><td><Status status={r.status} /></td></tr>)}</tbody></table></div>
            </>}
          </div>)}
      </>}
    </div>
  );
}
