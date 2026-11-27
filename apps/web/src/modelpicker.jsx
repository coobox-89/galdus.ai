import React, { useEffect, useState } from 'react';
import { api } from './api';

// Loads the workspace's model sources: BYOK connections plus any platform models.
export function useModelSources(token, organizationId, onError, refreshKey = 0) {
  const [state, setState] = useState({ connections: [], platform: [], providers: [], loaded: false });
  useEffect(() => {
    if (!organizationId) return undefined;
    let active = true;
    Promise.all([
      api('/v1/models/connections', { token, organizationId }),
      api('/v1/models', { token, organizationId }),
      api('/v1/models/providers', { token, organizationId }),
    ]).then(([connections, platform, providers]) => {
      if (active) setState({ connections, platform: platform.models, providers, loaded: true });
    }).catch(err => { if (active) { setState(s => ({ ...s, loaded: true })); onError(err); } });
    return () => { active = false; };
  }, [token, organizationId, onError, refreshKey]);
  return state;
}

// value = { connectionId, model }; connectionId '' means a platform model.
export function ModelPicker({ sources, value, onChange }) {
  const { connections, platform, providers } = sources;
  const conn = connections.find(c => c.id === value.connectionId);
  const suggestions = conn ? (providers.find(p => p.id === conn.provider)?.suggestions || []) : platform;

  useEffect(() => {
    if (value.connectionId || platform.length || !connections.length) return;
    const first = connections[0];
    onChange({ connectionId: first.id, model: first.default_model || '' });
  }, [connections, platform, value.connectionId, onChange]);

  if (!connections.length && !platform.length) {
    return <p className="hint">No models yet. Open the <b>Models</b> tab and connect a provider with your own API key.</p>;
  }
  return (
    <div className="controls">
      <label>Model source
        <select value={value.connectionId} onChange={e => {
          const c = connections.find(x => x.id === e.target.value);
          onChange({ connectionId: e.target.value, model: c ? (c.default_model || '') : (platform[0] || '') });
        }}>
          {connections.map(c => <option key={c.id} value={c.id}>{c.label === c.provider_label ? c.label : `${c.label} · ${c.provider_label}`}</option>)}
          {platform.length > 0 && <option value="">Platform models</option>}
        </select>
      </label>
      <label>Model
        <input list="model-suggestions" value={value.model} onChange={e => onChange({ ...value, model: e.target.value })}
          placeholder="e.g. qwen/qwen-2.5-72b-instruct" maxLength={200} required />
        <datalist id="model-suggestions">{suggestions.map(s => <option key={s} value={s} />)}</datalist>
      </label>
    </div>
  );
}
