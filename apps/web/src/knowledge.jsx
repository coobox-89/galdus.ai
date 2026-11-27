import React, { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from './config';
import { useWs } from './workspace';
import { Empty, PageHead, Pixels, plural, when } from './ui';

export function KnowledgePage() {
  const ws = useWs();
  const [selected, setSelected] = useState('');
  const [docs, setDocs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', connection_id: '', embedding_model: '' });
  const [text, setText] = useState({ title: '', content: '' });
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState('');
  const [drag, setDrag] = useState(false);
  const col = ws.collections.find(c => c.id === selected);

  useEffect(() => { if (!selected && ws.collections[0]) setSelected(ws.collections[0].id); }, [ws.collections, selected]);
  const loadDocs = useCallback(() => { if (selected) ws.call(`/v1/knowledge/collections/${selected}/documents`).then(setDocs).catch(ws.onError); }, [selected, ws]);
  useEffect(() => { loadDocs(); setHits(null); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function wrap(label, fn, done) {
    setBusy(label);
    try { await fn(); if (done) ws.toast(done); } catch (err) { ws.onError(err); } finally { setBusy(''); }
  }
  const after = () => { loadDocs(); ws.refresh(); };

  const create = e => { e.preventDefault(); wrap('create', async () => {
    const c = await ws.call('/v1/knowledge/collections', { method: 'POST', body: { name: form.name, description: form.description,
      connection_id: form.connection_id || null, embedding_model: form.embedding_model || null } });
    setForm({ name: '', description: '', connection_id: '', embedding_model: '' }); setCreating(false); setSelected(c.id); ws.refresh();
  }, 'Collection created.'); };
  const addText = e => { e.preventDefault(); wrap('text', async () => {
    await ws.call(`/v1/knowledge/collections/${selected}/documents/text`, { method: 'POST', body: text }); setText({ title: '', content: '' }); after();
  }, 'Text added.'); };
  const addUrl = e => { e.preventDefault(); wrap('url', async () => {
    await ws.call(`/v1/knowledge/collections/${selected}/documents/url`, { method: 'POST', body: { url } }); setUrl(''); after();
  }, 'Web page imported.'); };
  const upload = files => { const file = files?.[0]; if (!file) return; wrap('upload', async () => {
    const data = new FormData(); data.append('file', file);
    const res = await fetch(`${API_BASE_URL}/v1/knowledge/collections/${selected}/documents/upload`, {
      method: 'POST', body: data, headers: { Authorization: `Bearer ${ws.token}`, 'X-Organization-Id': ws.organizationId } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.detail || 'The upload failed.'), { status: res.status });
    after();
  }, `${file.name} uploaded.`); };
  const search = e => { e.preventDefault(); wrap('search', async () => setHits(await ws.call(`/v1/knowledge/collections/${selected}/search`, { method: 'POST', body: { query } }))); };
  const removeDoc = d => wrap('del', async () => { await ws.call(`/v1/knowledge/documents/${d.id}`, { method: 'DELETE' }); after(); }, 'Document removed.');
  const removeCol = () => { if (window.confirm(`Delete "${col.name}" and all its documents?`)) wrap('delc', async () => {
    await ws.call(`/v1/knowledge/collections/${col.id}`, { method: 'DELETE' }); setSelected(''); ws.refresh(); }, 'Collection deleted.'); };

  const createForm = (
    <form className="panel form" onSubmit={create}>
      <h2>New collection</h2>
      <div className="form-grid">
        <label className="field">Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={120} placeholder="IT runbooks" /></label>
        <label className="field">Description<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={500} /></label>
        <label className="field">Search type<small>Semantic search understands meaning; it needs an embedding model.</small>
          <select value={form.connection_id} onChange={e => setForm({ ...form, connection_id: e.target.value })}>
            <option value="">Keyword search</option>
            {ws.sources.connections.map(c => <option key={c.id} value={c.id}>Semantic, via {c.label}</option>)}
          </select>
        </label>
        <label className="field">Embedding model<small>{form.connection_id ? 'For example text-embedding-3-small' : 'Not needed for keyword search'}</small>
          <input value={form.embedding_model} onChange={e => setForm({ ...form, embedding_model: e.target.value })} disabled={!form.connection_id} required={!!form.connection_id} maxLength={200} />
        </label>
      </div>
      <div className="actions"><button className="btn" disabled={!!busy}>Create collection</button>
        {ws.collections.length > 0 && <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>}</div>
    </form>
  );

  return (
    <div className="stack">
      <PageHead title="Knowledge" actions={ws.canManage && !creating && ws.collections.length > 0 && <button type="button" className="btn ghost" onClick={() => setCreating(true)}>New collection</button>}>
        Your documents, organised in collections. Agents and apps answer from them and cite the exact passage.
      </PageHead>
      {(creating || ws.collections.length === 0) && (ws.canManage ? createForm : <Empty title="No collections yet">Ask a workspace admin to create one.</Empty>)}
      {col && !creating && <>
        <div className="tiles">{ws.collections.map(c => (
          <button key={c.id} type="button" className={`tile ${c.id === selected ? 'active' : ''}`} onClick={() => setSelected(c.id)}>
            <b>{c.name}</b><small>{c.description || plural(c.documents, 'document')}</small>
            <span className="meta"><span className="chip">{plural(c.documents, 'doc')}</span><span className={`chip ${c.search_mode === 'semantic' ? 'ok' : ''}`}>{c.search_mode}</span></span>
          </button>))}
        </div>
        <div className="cols">
          <div className="panel form">
            <h3>Add to {col.name}</h3>
            <label className={`empty ${drag ? 'drag' : ''}`} style={{ cursor: 'pointer', borderColor: drag ? 'var(--lime)' : undefined }}
              onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
              <input type="file" className="sr-only" accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,.htm,.log" onChange={e => { upload(e.target.files); e.target.value = ''; }} />
              {busy === 'upload' ? <Pixels label="Uploading" /> : <><b style={{ color: 'var(--cloud)' }}>Drop a file or click to upload</b><br /><small>PDF, Word-exported text, Markdown, CSV, JSON, HTML. Up to 5 MB.</small></>}
            </label>
            <form className="actions" onSubmit={addUrl} style={{ flexWrap: 'nowrap' }}>
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… import a public web page" required />
              <button className="btn ghost" disabled={!!busy}>Import</button>
            </form>
            <details><summary className="small muted" style={{ cursor: 'pointer' }}>Paste text instead</summary>
              <form className="form" onSubmit={addText} style={{ marginTop: 12 }}>
                <input value={text.title} onChange={e => setText({ ...text, title: e.target.value })} placeholder="Title" required maxLength={300} />
                <textarea value={text.content} onChange={e => setText({ ...text, content: e.target.value })} placeholder="Paste the document" required />
                <div><button className="btn ghost" disabled={!!busy}>Add text</button></div>
              </form>
            </details>
          </div>
          <div className="panel form">
            <h3>Try a search</h3>
            <form className="actions" onSubmit={search} style={{ flexWrap: 'nowrap' }}>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ask something your documents answer" required />
              <button className="btn ghost" disabled={!!busy}>Search</button>
            </form>
            {busy === 'search' && <Pixels />}
            {hits && (hits.length === 0 ? <p className="muted small">No passages match. Try other words or switch to semantic search.</p> :
              <ol className="stack" style={{ paddingLeft: 18, margin: 0, gap: 10 }}>{hits.map((h, i) => (
                <li key={i} className="small"><b>{h.title}</b>, part {h.chunk + 1}<br /><span className="muted">{h.content.slice(0, 240)}…</span></li>))}</ol>)}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Documents</h3><p>{plural(docs.length, 'document')} in this collection</p></div>
            {ws.canManage && <button type="button" className="btn danger sm" onClick={removeCol}>Delete collection</button>}</div>
          {docs.length === 0 ? <p className="muted" style={{ margin: 0 }}>Upload a file or import a page to get started.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Title</th><th>Source</th><th>Size</th><th>Indexed</th><th>Added</th><th /></tr></thead>
              <tbody>{docs.map(d => <tr key={d.id}><td>{d.title}</td><td>{({ google_drive: 'Google Drive', microsoft: 'SharePoint/OneDrive', web: 'Web page', pdf: 'PDF', text: 'Text' })[d.source_type] || d.source_type}</td><td className="num">{d.chars >= 1000 ? `${Math.round(d.chars / 1000)}k` : d.chars} characters, {plural(d.chunks, 'part')}</td>
                <td>{d.embedded ? <span className="chip ok">semantic</span> : <span className="chip">keyword</span>}</td><td>{when(d.created_at)}</td>
                <td style={{ display: 'flex', gap: 4 }}>{['google_drive', 'microsoft'].includes(d.source_type) && <button type="button" className="btn quiet sm" onClick={() => wrap('sync', async () => {
                  const r = await ws.call(`/v1/connectors/documents/${d.id}/resync`, { method: 'POST' }); after(); ws.toast(r.updated ? 'Document updated from the drive.' : 'Already up to date.'); })}>Sync</button>}
                  <button type="button" className="btn quiet sm" onClick={() => removeDoc(d)}>Remove</button></td></tr>)}</tbody></table></div>)}
        </div>
      </>}
    </div>
  );
}
