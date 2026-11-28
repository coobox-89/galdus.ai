// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Plus } from 'lucide-react';
import { useWs } from './workspace';
import { PageHead, Pixels, when, stagger, rise } from './ui';
import { GUIDE, ProviderMark } from './providerguide';
import { href } from './paths';

const clean = label => label.replace(/ \(.*\)$/, '');

export function ModelsPage() {
  const ws = useWs();
  const { sources } = ws;
  const [tests, setTests] = useState({});

  async function test(c) {
    const model = c.default_model || sources.providers.find(p => p.id === c.provider)?.suggestions[0];
    if (!model) return;
    setTests(t => ({ ...t, [c.id]: 'busy' }));
    try {
      const r = await ws.call(`/v1/models/connections/${c.id}/test`, { method: 'POST', body: { model } });
      setTests(t => ({ ...t, [c.id]: r.ok ? { ok: true, text: `${model} answered “${r.reply}”` } : { ok: false, text: `${r.error}: ${r.message}` } }));
    } catch (err) { setTests(t => ({ ...t, [c.id]: { ok: false, text: err.message } })); }
  }
  async function remove(c) {
    if (!window.confirm(`Disconnect "${c.label}"? The stored key is deleted.`)) return;
    try { await ws.call(`/v1/models/connections/${c.id}`, { method: 'DELETE' }); ws.toast('Provider disconnected.'); ws.refresh(); } catch (err) { ws.onError(err); }
  }

  return (
    <div className="stack">
      <PageHead title="Models" actions={ws.canManage && <button type="button" className="btn" onClick={() => ws.connectModel()}><Plus size={16} /> Connect a provider</button>}>
        Galdus is model-agnostic. Connect any provider with your own key, then use any model it offers in chat, agents, apps and automations. Keys are encrypted and never shown again.
      </PageHead>

      {sources.connections.length > 0 && (
        <section className="stack">
          <h2 className="section-title">Connected</h2>
          <div className="conn-grid">{sources.connections.map(c => {
            const t = tests[c.id];
            return (
              <div key={c.id} className="tile conn-tile" style={{ cursor: 'default' }}>
                <div className="conn-head"><ProviderMark id={c.provider} size={34} /><div><b>{c.label}</b><small>{clean(c.provider_label)}</small></div>
                  <span className="gs-badge ok"><CheckCircle2 size={12} /> Connected</span></div>
                <small>{c.api_key_hint ? `Key ending ${c.api_key_hint.replace('…', '')}.` : 'No key.'}{c.api_base ? ` ${c.api_base}` : ''}</small>
                <small>Default model {c.default_model || 'not set'}. Last used {when(c.last_used_at)}.</small>
                <div className="actions"><button type="button" className="btn ghost sm" onClick={() => test(c)}>Test</button>
                  {ws.canManage && <button type="button" className="btn quiet sm" onClick={() => remove(c)}>Disconnect</button>}</div>
                {t === 'busy' ? <Pixels /> : t && <span className={`chip ${t.ok ? 'ok' : 'bad'}`} style={{ whiteSpace: 'normal' }}>{t.text}</span>}
              </div>);
          })}</div>
        </section>)}

      <section className="stack">
        <h2 className="section-title">All providers</h2>
        <motion.div className="prov-grid" variants={stagger} initial="hidden" animate="show">
          {sources.providers.map(p => {
            const n = sources.connections.filter(c => c.provider === p.id).length;
            const g = GUIDE[p.id] || {};
            return (
              <motion.button key={p.id} type="button" variants={rise} className="prov-card" onClick={() => ws.connectModel(p.id)}
                whileHover={{ y: -3 }} whileTap={{ scale: .98 }}>
                <ProviderMark id={p.id} size={40} />
                <b>{clean(p.label)}</b>
                <small>{g.blurb}</small>
                <span className="prov-models">{p.suggestions.slice(0, 3).join(', ')}{p.suggestions.length > 3 ? '…' : ''}</span>
                <span className="prov-foot">{n ? <span className="gs-badge ok">{n} connected</span> : <span className="gs-badge">{g.tag}</span>}
                  <span className="prov-cta">{n ? 'Add another' : 'Connect'}</span></span>
              </motion.button>);
          })}
        </motion.div>
        {!ws.canManage && <p className="muted small">Only workspace owners and admins can connect providers. You can still open a card to see how it works.</p>}
        <p className="tm-note">Product names and logos belong to their respective owners and are shown only to indicate compatibility. Galdus.ai is an independent open-source project, not affiliated with or endorsed by any of these providers. <a href={href('/terms#trademarks')} target="_blank" rel="noopener noreferrer">Trademarks</a></p>
      </section>
    </div>
  );
}
