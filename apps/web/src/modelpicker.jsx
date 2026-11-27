import React, { useEffect } from 'react';
import { useWs } from './workspace';

// value = { connectionId, model }; connectionId '' means a platform model.
export function ModelPicker({ value, onChange, go }) {
  const { sources } = useWs();
  const { connections, platform, providers } = sources;
  const conn = connections.find(c => c.id === value.connectionId);
  const suggestions = conn ? (providers.find(p => p.id === conn.provider)?.suggestions || []) : platform;

  useEffect(() => {
    if (value.connectionId || value.model) return;
    if (connections[0]) onChange({ connectionId: connections[0].id, model: connections[0].default_model || '' });
    else if (platform[0]) onChange({ connectionId: '', model: platform[0] });
  }, [connections, platform, value.connectionId, value.model, onChange]);

  if (!sources.loaded) return null;
  if (!connections.length && !platform.length) {
    return (
      <div className="empty">
        <h3>Connect a model first</h3>
        <p>Galdus works with any provider. Add your API key once and every page can use it.</p>
        {go && <button type="button" className="btn" onClick={() => go('models')}>Connect a model</button>}
      </div>
    );
  }
  const listId = `models-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className="picker">
      <label className="field">Provider
        <select value={value.connectionId} onChange={e => {
          const c = connections.find(x => x.id === e.target.value);
          onChange({ connectionId: e.target.value, model: c ? (c.default_model || '') : (platform[0] || '') });
        }}>
          {connections.map(c => <option key={c.id} value={c.id}>{c.label === c.provider_label ? c.label : `${c.label} (${c.provider_label})`}</option>)}
          {platform.length > 0 && <option value="">Galdus platform models</option>}
        </select>
      </label>
      <label className="field">Model
        <input list={listId} value={value.model} onChange={e => onChange({ ...value, model: e.target.value })}
          placeholder="Type any model name" maxLength={200} required />
        <datalist id={listId}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
      </label>
    </div>
  );
}
