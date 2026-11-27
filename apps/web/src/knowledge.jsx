import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { API_BASE_URL } from './config';

export function useCollections(token, organizationId, onError, refreshKey) {
  const [collections, setCollections] = useState([]);
  useEffect(() => {
    if (!organizationId) return;
    api('/v1/knowledge/collections', { token, organizationId }).then(setCollections).catch(onError);
  }, [token, organizationId, onError, refreshKey]);
  return collections;
}

export function KnowledgeTab({ token, organizationId, role, sources, collections, onChanged, onError }) {
  const canManage = role === 'owner' || role === 'admin';
  const [selected, setSelected] = useState('');
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', connection_id: '', embedding_model: '' });
  const [text, setText] = useState({ title: '', content: '' });
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState('');
  const col = collections.find(c => c.id === selected);

  useEffect(() => { if (!selected && collections[0]) setSelected(collections[0].id); }, [collections, selected]);
  const loadDocs = useCallback(() => {
    if (!selected) return;
    api(`/v1/knowledge/collections/${selected}/documents`, { token, organizationId }).then(setDocs).catch(onError);
  }, [selected, token, organizationId, onError]);
  useEffect(() => { loadDocs(); setHits(null); }, [loadDocs]);

  async function wrap(label, fn) {
    setBusy(label);
    try { await fn(); } catch (err) { onError(err); } finally { setBusy(''); }
  }

  const create = e => { e.preventDefault(); wrap('create', async () => {
    const c = await api('/v1/knowledge/collections', { token, organizationId, method: 'POST', body: {
      name: form.name, description: form.description, connection_id: form.connection_id || null, embedding_model: form.embedding_model || null } });
    setForm({ name: '', description: '', connection_id: '', embedding_model: '' }); setSelected(c.id); onChanged();
  }); };

  const addText = e => { e.preventDefault(); wrap('text', async () => {
    await api(`/v1/knowledge/collections/${selected}/documents/text`, { token, organizationId, method: 'POST', body: text });
    setText({ title: '', content: '' }); loadDocs(); onChanged();
  }); };

  const upload = e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; wrap('upload', async () => {
    const data = new FormData(); data.append('file', file);
    const res = await fetch(`${API_BASE_URL}/v1/knowledge/collections/${selected}/documents/upload`, {
      method: 'POST', body: data, headers: { Authorization: `Bearer ${token}`, 'X-Organization-Id': organizationId } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.detail || 'Upload failed'), { status: res.status });
    loadDocs(); onChanged();
  }); };

  const search = e => { e.preventDefault(); wrap('search', async () => {
    setHits(await api(`/v1/knowledge/collections/${selected}/search`, { token, organizationId, method: 'POST', body: { query } }));
  }); };

  const removeDoc = d => wrap('del', async () => { await api(`/v1/knowledge/documents/${d.id}`, { token, organizationId, method: 'DELETE' }); loadDocs(); onChanged(); });
  const removeCol = () => { if (window.confirm(`Delete "${col.name}" and all its documents?`)) wrap('delc', async () => {
    await api(`/v1/knowledge/collections/${col.id}`, { token, organizationId, method: 'DELETE' }); setSelected(''); onChanged(); }); };

  return (
    <div>
      <p className="hint">Collections hold your documents. Agents and the "Chat with documents" app answer from them with citations. Semantic search needs an embedding model; without it, keyword search is used.</p>
      {collections.length > 0 && (
        <div className="controls">
          <label>Collection
            <select value={selected} onChange={e => setSelected(e.target.value)}>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name} · {c.documents} docs · {c.search_mode}</option>)}
            </select>
          </label>
          {col && canManage && <div className="row end"><button type="button" className="secondary" onClick={removeCol}>Delete collection</button></div>}
        </div>)}

      {col && <>
        <h3>Documents</h3>
        {docs.length === 0 ? <p className="empty">No documents yet.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Title</th><th>Type</th><th>Characters</th><th>Chunks</th><th>Embedded</th><th /></tr></thead>
            <tbody>{docs.map(d => <tr key={d.id}><td>{d.title}</td><td>{d.source_type}</td><td>{d.chars}</td><td>{d.chunks}</td><td>{d.embedded ? 'yes' : 'no'}</td>
              <td><button type="button" className="text-button" onClick={() => removeDoc(d)}>Remove</button></td></tr>)}</tbody></table></div>)}
        <div className="two">
          <form onSubmit={addText}>
            <label>Paste text · title<input value={text.title} onChange={e => setText({ ...text, title: e.target.value })} required maxLength={300} /></label>
            <textarea value={text.content} onChange={e => setText({ ...text, content: e.target.value })} placeholder="Paste a document…" required />
            <button disabled={!!busy}>{busy === 'text' ? 'Adding…' : 'Add text'}</button>
          </form>
          <div className="upload">
            <label>Upload a file (PDF, TXT, MD, CSV, JSON, HTML · max 5 MB)
              <input type="file" accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,.htm,.log" onChange={upload} disabled={!!busy} />
            </label>
            {busy === 'upload' && <p className="hint">Uploading and indexing…</p>}
          </div>
        </div>
        <h3>Test search</h3>
        <form onSubmit={search} className="row"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this collection" required />
          <button disabled={!!busy}>Search</button></form>
        {hits && (hits.length === 0 ? <p className="empty">No matches.</p> :
          <ol className="hits">{hits.map((h, i) => <li key={i}><b>{h.title}</b> · part {h.chunk + 1} · score {h.score}<br /><small>{h.content.slice(0, 280)}…</small></li>)}</ol>)}
      </>}

      {canManage && <>
        <h3>New collection</h3>
        <form onSubmit={create} className="grid-form">
          <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={120} /></label>
          <label>Description<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={500} /></label>
          <label>Embeddings connection (optional)
            <select value={form.connection_id} onChange={e => setForm({ ...form, connection_id: e.target.value })}>
              <option value="">None · keyword search</option>
              {sources.connections.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label>Embedding model<input value={form.embedding_model} onChange={e => setForm({ ...form, embedding_model: e.target.value })}
            placeholder="e.g. text-embedding-3-small" disabled={!form.connection_id} required={!!form.connection_id} maxLength={200} /></label>
          <div className="row"><button disabled={!!busy}>Create collection</button></div>
        </form>
      </>}
    </div>
  );
}
