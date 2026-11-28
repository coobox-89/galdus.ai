// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Cloud, FileText, Folder, Search, X } from 'lucide-react';
import { useWs } from './workspace';
import { Select } from './select';
import { Pixels } from './ui';

// Cloud drives: connect Google Drive / Microsoft 365, browse, import into knowledge.
export function CloudDrives() {
  const ws = useWs();
  const [data, setData] = useState({ available: [], connections: [] });
  const [browsing, setBrowsing] = useState(null);
  const load = useCallback(() => ws.call('/v1/connectors').then(setData).catch(ws.onError), [ws]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const provider = q.get('connect_provider');
    if (provider || q.get('error')) history.replaceState(null, '', `${window.location.pathname}#/integrations`);
    if (q.get('error')) ws.toast(q.get('error'), 'error');
    if (provider && q.get('code') && q.get('state')) {
      // The provider sent the browser back: finish the connection with this session, so it lands in this workspace.
      ws.call(`/v1/connectors/${encodeURIComponent(provider)}/complete`, { method: 'POST', body: { code: q.get('code'), state: q.get('state') } })
        .then(() => ws.toast('Cloud drive connected. You can now import files.'))
        .catch(ws.onError)
        .finally(load);
    } else {
      load();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect(kind) {
    try { const { url } = await ws.call(`/v1/connectors/${kind}/authorize`, { method: 'POST' }); window.location.href = url; } catch (err) { ws.onError(err); }
  }
  async function disconnect(c) {
    if (!window.confirm(`Disconnect ${c.label} (${c.account_email})? Imported documents stay.`)) return;
    try { await ws.call(`/v1/connectors/${c.id}`, { method: 'DELETE' }); load(); } catch (err) { ws.onError(err); }
  }

  return (
    <div className="panel">
      <div className="panel-head"><div><h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Cloud size={18} color="#B6FF00" /> Cloud drives</h3>
        <p>Import documents from Google Drive, OneDrive and SharePoint into knowledge. They re-sync daily.</p></div></div>
      <div className="tiles">
        {data.available.map(a => {
          const linked = data.connections.filter(c => c.provider === a.id);
          return (
            <div key={a.id} className="tile" style={{ cursor: 'default' }}>
              <span className="ico"><Cloud size={18} /></span>
              <b>{a.label}</b>
              {linked.map(c => (
                <span key={c.id} className="meta" style={{ alignItems: 'center' }}><span className="chip ok">{c.account_email || 'connected'}</span>
                  {ws.canManage && <button type="button" className="btn ghost sm" onClick={() => setBrowsing(c)}>Browse files</button>}
                  {ws.canManage && <button type="button" className="btn quiet sm" onClick={() => disconnect(c)}>Disconnect</button>}</span>))}
              {!a.configured ? <><small>Not enabled on this server yet. The platform owner adds the {a.id === 'google_drive' ? 'Google' : 'Microsoft'} OAuth app once.</small>
                {ws.user?.is_platform_admin && <div><button type="button" className="btn ghost sm" onClick={() => { window.location.hash = '/admin?setup'; }}>Set it up</button></div>}</>
                : ws.canManage && <div><button type="button" className="btn sm" onClick={() => connect(a.id)}>{linked.length ? 'Add account' : 'Connect'}</button></div>}
            </div>);
        })}
      </div>
      <AnimatePresence>{browsing && <Browser conn={browsing} onClose={() => setBrowsing(null)} />}</AnimatePresence>
    </div>
  );
}

function Browser({ conn, onClose }) {
  const ws = useWs();
  const [path, setPath] = useState([{ id: null, name: conn.label }]);
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState({});
  const [collection, setCollection] = useState(ws.collections[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const folder = path[path.length - 1].id;

  const load = useCallback((q) => {
    setItems(null);
    const params = new URLSearchParams();
    if (q) params.set('search', q); else if (folder) params.set('folder', folder);
    ws.call(`/v1/connectors/${conn.id}/files?${params}`).then(r => setItems(r.items)).catch(err => { ws.onError(err); setItems([]); });
  }, [conn.id, folder, ws]);
  useEffect(() => { load(''); }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

  async function importNow() {
    setBusy(true);
    try {
      const r = await ws.call(`/v1/connectors/${conn.id}/import`, { method: 'POST', body: { collection_id: collection, refs: Object.keys(picked) } });
      const ok = r.results.filter(x => x.ok).length;
      const bad = r.results.filter(x => !x.ok);
      ws.toast(`${ok} file${ok === 1 ? '' : 's'} imported.`);
      bad.forEach(b => ws.toast(`${picked[b.ref]}: ${b.error}`, 'error'));
      ws.refresh(); onClose();
    } catch (err) { ws.onError(err); } finally { setBusy(false); }
  }

  const count = Object.keys(picked).length;
  return (
    <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ paddingTop: '8vh' }}>
      <motion.div className="modal" role="dialog" aria-label={`Browse ${conn.label}`} onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 20, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        <div className="panel-head" style={{ margin: 0 }}><div><h3>{conn.label}</h3><p>{conn.account_email}</p></div>
          <button type="button" className="btn quiet icon" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <div className="actions" style={{ flexWrap: 'nowrap' }}>
          <form style={{ flex: 1, position: 'relative' }} onSubmit={e => { e.preventDefault(); load(search); }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--faint)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files" style={{ paddingLeft: 32 }} /></form>
          <div className="crumbs">{path.map((p, i) => <React.Fragment key={i}>{i > 0 && '/'}
            <button type="button" onClick={() => { setSearch(''); setPath(path.slice(0, i + 1)); }}>{p.name}</button></React.Fragment>)}</div>
        </div>
        <div className="files">
          {items === null ? <div style={{ padding: 20 }}><Pixels label="Loading files" /></div> : items.length === 0 ? <p className="muted small">No files here.</p> :
            items.map(it => (
              <div key={it.id} className="file">
                <input type="checkbox" disabled={!it.importable} checked={!!picked[it.id]} aria-label={`Select ${it.name}`}
                  onChange={() => setPicked(p => { const n = { ...p }; if (n[it.id]) delete n[it.id]; else n[it.id] = it.name; return n; })} />
                {it.folder ? <Folder size={16} color="#FFC107" /> : <FileText size={16} color="#9DB0CB" />}
                {it.folder ? <button type="button" className="link" onClick={() => { setSearch(''); setPath([...path, { id: it.id, name: it.name }]); }}>{it.name}</button> : <span>{it.name}</span>}
                <span className="muted">{it.size ? `${Math.max(1, Math.round(it.size / 1024))} KB` : ''}</span>
              </div>))}
        </div>
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          {ws.collections.length ? (
            <label className="field" style={{ flex: 1, minWidth: 200 }}>Import into
              <Select value={collection} onChange={setCollection} options={ws.collections.map(c => ({ value: c.id, label: c.name }))} /></label>
          ) : <span className="small muted">Create a knowledge collection first.</span>}
          <button type="button" className="btn" disabled={!count || !collection || busy} onClick={importNow}>{busy ? 'Importing…' : `Import ${count || ''} file${count === 1 ? '' : 's'}`}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
