import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ModelPicker } from './modelpicker';
import { RunView } from './runview';

const EMPTY = { name: '', description: '', instructions: '', collection_id: '' };

export function AgentsTab({ token, organizationId, role, sources, collections, onError }) {
  const canManage = role === 'owner' || role === 'admin';
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState(null);
  const [model, setModel] = useState({ connectionId: '', model: '' });
  const [input, setInput] = useState('');
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const pick = useCallback(v => setModel(v), []);
  const agent = agents.find(a => a.id === selected);

  const load = useCallback(() => api('/v1/agents', { token, organizationId }).then(list => {
    setAgents(list); setSelected(s => s || list[0]?.id || '');
  }).catch(onError), [token, organizationId, onError]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    api(`/v1/runs?agent_id=${selected}&limit=10`, { token, organizationId }).then(setHistory).catch(onError);
  }, [selected, token, organizationId, onError, run]);

  function startEdit(a) {
    setEditing(a ? { ...a, collection_id: a.collection_id || '' } : { ...EMPTY });
    setModel(a ? { connectionId: a.connection_id || '', model: a.model } : { connectionId: '', model: '' });
  }

  async function save(e) {
    e.preventDefault();
    try {
      const body = { name: editing.name, description: editing.description, instructions: editing.instructions,
        collection_id: editing.collection_id || null, connection_id: model.connectionId || null, model: model.model };
      const saved = editing.id
        ? await api(`/v1/agents/${editing.id}`, { token, organizationId, method: 'PUT', body })
        : await api('/v1/agents', { token, organizationId, method: 'POST', body });
      setEditing(null); setSelected(saved.id); load();
    } catch (err) { onError(err); }
  }

  async function remove() {
    if (!window.confirm(`Delete agent "${agent.name}"?`)) return;
    try { await api(`/v1/agents/${agent.id}`, { token, organizationId, method: 'DELETE' }); setSelected(''); load(); } catch (err) { onError(err); }
  }

  async function execute(e) {
    e.preventDefault();
    setBusy(true); setRun(null);
    try { setRun(await api(`/v1/agents/${agent.id}/runs`, { token, organizationId, method: 'POST', body: { input } })); }
    catch (err) { onError(err); } finally { setBusy(false); }
  }

  if (editing) return (
    <form onSubmit={save}>
      <h3>{editing.id ? 'Edit agent' : 'New agent'}</h3>
      <div className="grid-form">
        <label>Name<input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} required maxLength={120} /></label>
        <label>Description<input value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} maxLength={500} /></label>
      </div>
      <label>Instructions (system prompt)
        <textarea value={editing.instructions} onChange={e => setEditing({ ...editing, instructions: e.target.value })} required maxLength={20000}
          placeholder="You are a support assistant for… Always answer in Italian…" />
      </label>
      <ModelPicker sources={sources} value={model} onChange={pick} />
      <label>Knowledge (optional)
        <select value={editing.collection_id} onChange={e => setEditing({ ...editing, collection_id: e.target.value })}>
          <option value="">None</option>
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="row"><button disabled={!model.model}>Save agent</button><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>
  );

  return (
    <div>
      <p className="hint">Agents are reusable assistants: instructions, a model and optional knowledge. Every run is saved with its sources.</p>
      <div className="controls">
        <label>Agent
          <select value={selected} onChange={e => { setSelected(e.target.value); setRun(null); }} disabled={!agents.length}>
            {agents.length === 0 && <option>No agents yet</option>}
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {canManage && <div className="row end">
          <button type="button" onClick={() => startEdit(null)}>New agent</button>
          {agent && <button type="button" className="secondary" onClick={() => startEdit(agent)}>Edit</button>}
          {agent && <button type="button" className="secondary" onClick={remove}>Delete</button>}
        </div>}
      </div>
      {agent && <>
        <p className="hint">{agent.description || 'No description.'} · model {agent.model}{agent.collection_id ? ` · knowledge: ${collections.find(c => c.id === agent.collection_id)?.name || 'collection'}` : ''}</p>
        <form onSubmit={execute}>
          <textarea value={input} onChange={e => setInput(e.target.value)} placeholder={`Ask ${agent.name}…`} required maxLength={50000} />
          <button disabled={busy}>{busy ? 'Running…' : 'Run agent'}</button>
        </form>
        <RunView run={run} />
        {history.length > 0 && <>
          <h3>Recent runs</h3>
          <div className="table-wrap"><table><thead><tr><th>When</th><th>Status</th><th>Input</th><th>Tokens</th></tr></thead>
            <tbody>{history.map(r => <tr key={r.id} onClick={() => setRun(r)} className="clickable"><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.status}</td>
              <td>{r.input.slice(0, 60)}</td><td>{r.prompt_tokens + r.completion_tokens}</td></tr>)}</tbody></table></div>
        </>}
      </>}
    </div>
  );
}
