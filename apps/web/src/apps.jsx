import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ModelPicker } from './modelpicker';
import { RunView } from './runview';

export function AppsTab({ token, organizationId, sources, collections, onError }) {
  const [apps, setApps] = useState([]);
  const [appId, setAppId] = useState('');
  const [inputs, setInputs] = useState({});
  const [collectionId, setCollectionId] = useState('');
  const [model, setModel] = useState({ connectionId: '', model: '' });
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const pick = useCallback(v => setModel(v), []);
  const app = apps.find(a => a.id === appId);

  useEffect(() => { api('/v1/apps', { token, organizationId }).then(list => { setApps(list); setAppId(list[0]?.id || ''); }).catch(onError); }, [token, organizationId, onError]);
  useEffect(() => { if (!collectionId && collections[0]) setCollectionId(collections[0].id); }, [collections, collectionId]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setRun(null);
    try {
      setRun(await api(`/v1/apps/${appId}/runs`, { token, organizationId, method: 'POST', body: {
        connection_id: model.connectionId || null, model: model.model, collection_id: app.needs_collection ? collectionId : null, inputs } }));
    } catch (err) { onError(err); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="app-grid">{apps.map(a => (
        <button key={a.id} type="button" className={`app-card ${a.id === appId ? 'active' : ''}`} onClick={() => { setAppId(a.id); setInputs({}); setRun(null); }}>
          <b>{a.name}</b><small>{a.description}</small>
        </button>))}
      </div>
      {app && <form onSubmit={submit}>
        <h3>{app.name}</h3>
        <ModelPicker sources={sources} value={model} onChange={pick} />
        {app.needs_collection && (collections.length ? (
          <label>Knowledge collection
            <select value={collectionId} onChange={e => setCollectionId(e.target.value)}>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name} · {c.documents} docs</option>)}
            </select>
          </label>) : <p className="hint">Create a collection in the <b>Knowledge</b> tab first.</p>)}
        {app.fields.map(f => (
          <label key={f.id}>{f.label}
            {f.type === 'textarea' && <textarea value={inputs[f.id] || ''} onChange={e => setInputs({ ...inputs, [f.id]: e.target.value })} required maxLength={50000} />}
            {f.type === 'text' && <input value={inputs[f.id] || ''} onChange={e => setInputs({ ...inputs, [f.id]: e.target.value })} maxLength={500} />}
            {f.type === 'select' && <select value={inputs[f.id] || f.options[0]} onChange={e => setInputs({ ...inputs, [f.id]: e.target.value })}>
              {f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>}
          </label>))}
        <button disabled={busy || !model.model || (app.needs_collection && !collectionId)}>{busy ? 'Working…' : 'Run'}</button>
      </form>}
      <RunView run={run} />
    </div>
  );
}
