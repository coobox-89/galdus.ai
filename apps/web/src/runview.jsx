// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { motion } from 'motion/react';
import { Md, Status } from './ui';

export function RunView({ run }) {
  if (!run) return null;
  const tools = (run.steps || []).filter(s => s.tool !== 'guardrail');
  const guard = (run.steps || []).find(s => s.tool === 'guardrail');
  return (
    <motion.div className={`run ${run.status}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
      <div className="run-head">
        <Status status={run.status} />
        <span className="small muted num">{run.model} · {(run.duration_ms / 1000).toFixed(1)} s{run.prompt_tokens + run.completion_tokens ? ` · ${run.prompt_tokens + run.completion_tokens} tokens` : ''}</span>
      </div>
      {run.status === 'succeeded' ? <Md>{run.output}</Md> : <p style={{ margin: 0, color: 'var(--danger)' }}>{run.error}</p>}
      {guard && <span className="chip warn"><span className="px" />{guard.output}</span>}
      {tools.length > 0 && (
        <details><summary>Used {tools.length} tool{tools.length > 1 ? 's' : ''}</summary>
          <div className="trace">{tools.map((s, i) => (
            <div key={i}><span className={`chip ${s.ok ? 'ok' : 'bad'}`}>{s.tool}</span><code>{(s.output || '').slice(0, 160)}</code></div>))}</div>
        </details>)}
      {run.sources?.length > 0 && (
        <details><summary>{run.sources.length} source{run.sources.length > 1 ? 's' : ''}</summary>
          <ol>{run.sources.map((s, i) => <li key={i}><b>{s.title}</b>, part {s.chunk + 1}<br /><small>{s.excerpt}…</small></li>)}</ol>
        </details>)}
    </motion.div>
  );
}
