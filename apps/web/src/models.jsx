import React, { useState } from 'react';
import { useWs } from './workspace';
import { PageHead, Pixels, when } from './ui';

export function ModelsPage() {
  const ws = useWs();
  const { sources } = ws;
  const [form, setForm] = useState({ provider: 'openrouter', label: '', api_key: '', api_base: '', default_model: '' });
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState({});
  const spec = sources.providers.find(p => p.id === form.provider);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await ws.call('/v1/models/connections', { method: 'POST', body: { provider: form.provider, label: form.label || spec?.label,
        api_key: form.api_key || null, api_base: form.api_base || null, default_model: form.default_model || null } });
      setForm(f => ({ ...f, label: '', api_key: '', api_base: '', default_model: '' }));
      ws.toast('Provider connected.'); ws.refresh();
    } catch (err) { ws.onError(err); } finally { setBusy(false); }
  }
  async function test(c) {
    const model = window.prompt('Which model should we test?', c.default_model || '');
    if (!model) return;
    setTests(t => ({ ...t, [c.id]: 'busy' }));
    try {
      const r = await ws.call(`/v1/models/connections/${c.id}/test`, { method: 'POST', body: { model } });
      setTests(t => ({ ...t, [c.id]: r.ok ? { ok: true, text: `${r.model} answered “${r.reply}”` } : { ok: false, text: `${r.error}: ${r.message}` } }));
    } catch (err) { setTests(t => ({ ...t, [c.id]: { ok: false, text: err.message } })); }
  }
  async function remove(c) {
    if (!window.confirm(`Disconnect "${c.label}"? The stored key is deleted.`)) return;
    try { await ws.call(`/v1/models/connections/${c.id}`, { method: 'DELETE' }); ws.toast('Provider disconnected.'); ws.refresh(); } catch (err) { ws.onError(err); }
  }

  return (
    <div className="stack">
      <PageHead title="Models">Galdus is model-agnostic. Connect any provider with your own key, then type any model it offers. Keys are encrypted and never shown again.</PageHead>
      {sources.connections.length > 0 && (
        <div className="tiles">{sources.connections.map(c => {
          const t = tests[c.id];
          return (
            <div key={c.id} className="tile" style={{ cursor: 'default' }}>
              <b>{c.label}</b>
              <small>{c.label !== c.provider_label && `${c.provider_label}. `}{c.api_key_hint ? `Key ending ${c.api_key_hint.replace('…', '')}.` : 'No key.'}{c.api_base ? ` ${c.api_base}` : ''}</small>
              <small>Default model {c.default_model || 'not set'}. Last used {when(c.last_used_at)}.</small>
              <div className="actions"><button type="button" className="btn ghost sm" onClick={() => test(c)}>Test</button>
                {ws.canManage && <button type="button" className="btn quiet sm" onClick={() => remove(c)}>Disconnect</button>}</div>
              {t === 'busy' ? <Pixels /> : t && <span className={`chip ${t.ok ? 'ok' : 'bad'}`} style={{ whiteSpace: 'normal' }}>{t.text}</span>}
            </div>);
        })}</div>)}
      {ws.canManage ? (
        <form className="panel form" onSubmit={add}>
          <h2>Connect a provider</h2>
          <div className="form-grid">
            <label className="field">Provider
              <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
                {sources.providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="field">Display name<input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder={spec?.label} maxLength={80} /></label>
            {spec?.requires_base_url && <label className="field span">Server address<small>The OpenAI-compatible or Ollama endpoint, reachable over https.</small>
              <input type="url" value={form.api_base} onChange={e => setForm({ ...form, api_base: e.target.value })} placeholder="https://models.example.com/v1" required /></label>}
            <label className="field">API key{!spec?.requires_key && <small>Optional</small>}
              <input type="password" autoComplete="off" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} required={!!spec?.requires_key} maxLength={1000} /></label>
            <label className="field">Default model<small>Any model name the provider offers.</small>
              <input list="prov-sugg" value={form.default_model} onChange={e => setForm({ ...form, default_model: e.target.value })} placeholder={spec?.suggestions?.[0]} maxLength={200} />
              <datalist id="prov-sugg">{(spec?.suggestions || []).map(s => <option key={s} value={s} />)}</datalist></label>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Tip: OpenRouter gives one key for hundreds of models, including Qwen, DeepSeek, Llama and Mistral.</p>
          <div><button className="btn" disabled={busy}>{busy ? 'Connecting…' : 'Connect provider'}</button></div>
        </form>
      ) : <p className="muted">Only workspace owners and admins can connect providers.</p>}
    </div>
  );
}
