import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { useWs } from './workspace';
import { Combo, Select } from './select';
import { ProviderMark } from './providerguide';

const clean = label => label.replace(/ \(.*\)$/, '');

// One dropdown with every model of every provider in the catalog.
// Connected providers can be used at once; picking any other model opens the connect wizard.
// value = { connectionId, model }; connectionId '' means a Galdus platform model.
export function ModelPicker({ value, onChange, compact, label = 'Model' }) {
  const ws = useWs();
  const { connections, platform, providers, loaded } = ws.sources;
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (value.connectionId || value.model) return;
    if (connections[0]) onChange({ connectionId: connections[0].id, model: connections[0].default_model || providers.find(p => p.id === connections[0].provider)?.suggestions[0] || '' });
    else if (platform[0]) onChange({ connectionId: '', model: platform[0] });
  }, [connections, platform, providers, value.connectionId, value.model, onChange]);

  const options = useMemo(() => {
    const out = [];
    for (const c of connections) {
      const spec = providers.find(p => p.id === c.provider);
      const models = [...new Set([c.default_model, ...(spec?.suggestions || [])].filter(Boolean))];
      const group = c.label === clean(c.provider_label) ? clean(c.provider_label) : `${c.label}, ${clean(c.provider_label)}`;
      for (const m of models) out.push({ value: `${c.id}|${m}`, label: m, group, icon: <ProviderMark id={c.provider} size={20} />, badge: m === c.default_model ? 'Default' : undefined, badgeTone: 'ok' });
      out.push({ value: `${c.id}|__custom`, label: 'Another model name…', group, icon: <Plus size={16} />, tone: 'muted' });
    }
    if (platform.length) for (const m of platform) out.push({ value: `|${m}`, label: m, group: 'Galdus platform', icon: <Sparkles size={16} /> });
    const connected = new Set(connections.map(c => c.provider));
    for (const p of providers) {
      if (connected.has(p.id)) continue;
      for (const m of p.suggestions) out.push({ value: `new:${p.id}|${m}`, label: m, group: `${clean(p.label)}, not connected`, icon: <ProviderMark id={p.id} size={20} />, badge: 'Connect', badgeTone: 'warn', tone: 'dim' });
    }
    out.push({ value: '__wizard', label: 'Connect another provider…', group: 'More', icon: <Plus size={16} />, tone: 'muted' });
    return out;
  }, [connections, platform, providers]);

  const current = value.connectionId === '' && value.model ? `|${value.model}` : `${value.connectionId}|${value.model}`;
  const listed = options.some(o => o.value === current);
  const conn = connections.find(c => c.id === value.connectionId);
  const shownOptions = listed || !value.model ? options
    : [{ value: current, label: value.model, group: conn ? clean(conn.provider_label) : 'Galdus platform', icon: conn ? <ProviderMark id={conn.provider} size={20} /> : <Sparkles size={16} /> }, ...options];

  async function pick(v) {
    if (v === '__wizard') { const r = await ws.connectModel(); if (r) { setCustom(false); onChange(r); } return; }
    const [head, model] = v.split('|');
    if (head.startsWith('new:')) { const r = await ws.connectModel(head.slice(4), model); if (r) { setCustom(false); onChange(r); } return; }
    if (model === '__custom') { setCustom(true); onChange({ connectionId: head, model: '' }); return; }
    setCustom(false);
    onChange({ connectionId: head, model });
  }

  if (!loaded) return null;
  const spec = conn && providers.find(p => p.id === conn.provider);
  return (
    <div className={`picker ${compact ? 'compact' : ''}`}>
      <label className="field">{label}
        <Select value={current} onChange={pick} options={shownOptions} placeholder="Choose a model" searchable compact={compact} />
      </label>
      {(custom || (conn && value.model === '')) && (
        <label className="field">Model name<small>Any model {conn ? clean(conn.provider_label) : 'the provider'} offers.</small>
          <Combo value={value.model} onChange={m => onChange({ ...value, model: m })} suggestions={spec?.suggestions || []} placeholder={spec?.suggestions?.[0] || 'model-name'} required />
        </label>)}
    </div>
  );
}
