// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect, useState } from 'react';
import { ModelPicker } from './modelpicker';
import { RunView } from './runview';
import { useWs } from './workspace';
import { Select } from './select';
import { motion } from 'motion/react';
import { BookOpen, ClipboardList, FileSearch, Languages, Mail, PenLine, Scale, Ticket } from 'lucide-react';
import { PageHead, Pixels, rise, stagger } from './ui';

const APP_ICONS = { 'document-qa': BookOpen, summarize: FileSearch, rewrite: PenLine, email: Mail, translate: Languages,
  'ticket-triage': Ticket, 'contract-review': Scale, 'meeting-actions': ClipboardList };

export function AppsPage({ go }) {
  const ws = useWs();
  const [apps, setApps] = useState([]);
  const [appId, setAppId] = useState('');
  const [inputs, setInputs] = useState({});
  const [collectionId, setCollectionId] = useState('');
  const [model, setModel] = useState({ connectionId: '', model: '' });
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const pick = useCallback(v => setModel(v), []);
  const app = apps.find(a => a.id === appId);

  useEffect(() => { ws.call('/v1/apps').then(list => { setApps(list); setAppId(list[0]?.id || ''); }).catch(ws.onError); }, [ws.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!collectionId && ws.collections[0]) setCollectionId(ws.collections[0].id); }, [ws.collections, collectionId]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setRun(null);
    try {
      setRun(await ws.call(`/v1/apps/${appId}/runs`, { method: 'POST', body: {
        connection_id: model.connectionId || null, model: model.model, collection_id: app.needs_collection ? collectionId : null, inputs } }));
    } catch (err) { ws.onError(err); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <PageHead title="Apps">Ready-made tools for everyday work. Pick one, fill in the form, get a result in seconds.</PageHead>
      <motion.div className="tiles" role="group" aria-label="Apps" variants={stagger} initial="hidden" animate={apps.length ? 'show' : 'hidden'}>{apps.map(a => {
        const Icon = APP_ICONS[a.id] || FileSearch;
        return (
        <motion.button variants={rise} key={a.id} type="button" className={`tile ${a.id === appId ? 'active' : ''}`} aria-pressed={a.id === appId}
          onClick={() => { setAppId(a.id); setInputs({}); setRun(null); }}>
          <span className="ico"><Icon size={18} /></span>
          <b>{a.name}</b><small>{a.description}</small>
          {a.needs_collection && <span className="meta"><span className="chip">Uses knowledge</span></span>}
        </motion.button>); })}
      </motion.div>
      {app && (
        <form className="panel form" onSubmit={submit}>
          <h2>{app.name}</h2>
          <ModelPicker value={model} onChange={pick} go={go} />
          {app.needs_collection && (ws.collections.length ? (
            <label className="field">Knowledge collection
              <Select value={collectionId} onChange={setCollectionId}
                options={ws.collections.map(c => ({ value: c.id, label: c.name, hint: c.documents === 1 ? '1 document' : `${c.documents} documents` }))} />
            </label>) : <div className="empty"><h3>No knowledge yet</h3><p>This app answers from your documents.</p>
              <button type="button" className="btn" onClick={() => go('knowledge')}>Add documents</button></div>)}
          {app.fields.map(f => (
            <label key={f.id} className="field">{f.label}
              {f.type === 'textarea' && <textarea value={inputs[f.id] || ''} onChange={e => setInputs({ ...inputs, [f.id]: e.target.value })} required maxLength={50000} />}
              {f.type === 'text' && <input value={inputs[f.id] || ''} onChange={e => setInputs({ ...inputs, [f.id]: e.target.value })} maxLength={500} />}
              {f.type === 'select' && <Select value={inputs[f.id] || f.options[0]} onChange={v => setInputs({ ...inputs, [f.id]: v })}
                options={f.options.map(o => ({ value: o, label: o }))} />}
            </label>))}
          <div className="actions">
            <button className="btn" disabled={busy || !model.model || (app.needs_collection && !collectionId)}>Run {app.name.toLowerCase()}</button>
            {busy && <Pixels />}
          </div>
        </form>)}
      <RunView run={run} />
    </div>
  );
}
