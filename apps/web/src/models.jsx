import React, { useState } from 'react';
import { api } from './api';

const when = iso => (iso ? new Date(iso).toLocaleString() : 'never');

export function ModelsTab({ token, organizationId, role, sources, onChanged, onError }) {
  const canManage = role === 'owner' || role === 'admin';
  const [form, setForm] = useState({ provider: 'openrouter', label: '', api_key: '', api_base: '', default_model: '' });
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState({});
  const spec = sources.providers.find(p => p.id === form.provider);

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/v1/models/connections', { token, organizationId, method: 'POST', body: {
        provider: form.provider, label: form.label || spec?.label, api_key: form.api_key || null,
        api_base: form.api_base || null, default_model: form.default_model || null,
      } });
      setForm(f => ({ ...f, label: '', api_key: '', api_base: '', default_model: '' }));
      onChanged();
    } catch (err) { onError(err); } finally { setBusy(false); }
  }

  async function test(c) {
    const model = window.prompt('Model to test', c.default_model || '');
    if (!model) return;
    setTests(t => ({ ...t, [c.id]: 'Testing…' }));
    try {
      const r = await api(`/v1/models/connections/${c.id}/test`, { token, organizationId, method: 'POST', body: { model } });
      setTests(t => ({ ...t, [c.id]: r.ok ? `OK · ${r.model} replied "${r.reply}"` : `Failed · ${r.error}: ${r.message}` }));
    } catch (err) { setTests(t => ({ ...t, [c.id]: `Failed · ${err.message}` })); }
  }

  async function remove(c) {
    if (!window.confirm(`Remove the connection "${c.label}"? Its stored key will be deleted.`)) return;
    try { await api(`/v1/models/connections/${c.id}`, { token, organizationId, method: 'DELETE' }); onChanged(); }
    catch (err) { onError(err); }
  }

  return (
    <div className="models">
      <p className="hint">Galdus.ai is model-agnostic: connect any provider with your own API key and type any model name it offers. Keys are encrypted and never shown again.</p>
      <h3>Connections</h3>
      {sources.connections.length === 0 ? <p className="empty">No connections yet.</p> : (
        <div className="cards">{sources.connections.map(c => (
          <div key={c.id} className="card">
            <b>{c.label}</b>
            <small>{c.label !== c.provider_label ? `${c.provider_label} · ` : ''}{c.api_key_hint ? `key ${c.api_key_hint}` : 'no key'}{c.api_base ? ` · ${c.api_base}` : ''}</small>
            <small>Default model: {c.default_model || '—'} · last used {when(c.last_used_at)}</small>
            <div className="row">
              <button type="button" className="secondary" onClick={() => test(c)}>Test</button>
              {canManage && <button type="button" className="secondary" onClick={() => remove(c)}>Remove</button>}
            </div>
            {tests[c.id] && <small className={tests[c.id].startsWith('OK') ? 'ok' : 'error'}>{tests[c.id]}</small>}
          </div>))}
        </div>)}

      {canManage ? (
        <>
          <h3>Add a connection</h3>
          <form onSubmit={add} className="grid-form">
            <label>Provider
              <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
                {sources.providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label>Name<input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder={spec?.label} maxLength={80} /></label>
            {spec?.requires_key !== false && (
              <label>API key<input type="password" autoComplete="off" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} required={spec?.requires_key} maxLength={1000} /></label>
            )}
            {spec?.requires_base_url && (
              <label>Base URL<input type="url" value={form.api_base} onChange={e => setForm({ ...form, api_base: e.target.value })} placeholder="https://your-server.example.com/v1" required /></label>
            )}
            {spec?.requires_base_url && !spec?.requires_key && (
              <label>API key (optional)<input type="password" autoComplete="off" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} maxLength={1000} /></label>
            )}
            <label>Default model
              <input list="provider-suggestions" value={form.default_model} onChange={e => setForm({ ...form, default_model: e.target.value })} placeholder={spec?.suggestions?.[0]} maxLength={200} />
              <datalist id="provider-suggestions">{(spec?.suggestions || []).map(s => <option key={s} value={s} />)}</datalist>
            </label>
            <div className="row"><button disabled={busy}>{busy ? 'Saving…' : 'Add connection'}</button></div>
          </form>
        </>
      ) : <p className="hint">Only workspace owners and admins can add connections.</p>}
    </div>
  );
}
