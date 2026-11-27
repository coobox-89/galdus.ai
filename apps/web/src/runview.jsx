import React from 'react';

export function RunView({ run }) {
  if (!run) return null;
  return (
    <div className={`run ${run.status}`}>
      <small>{run.status === 'succeeded' ? run.model : 'Failed'} · {(run.duration_ms / 1000).toFixed(1)} s{run.prompt_tokens + run.completion_tokens ? ` · ${run.prompt_tokens + run.completion_tokens} tokens` : ''}</small>
      {run.status === 'succeeded' ? <pre>{run.output}</pre> : <p className="error">{run.error}</p>}
      {run.sources?.length > 0 && (
        <details className="sources"><summary>{run.sources.length} sources</summary>
          <ol>{run.sources.map((s, i) => <li key={i}><b>{s.title}</b> · part {s.chunk + 1}<br /><small>{s.excerpt}…</small></li>)}</ol>
        </details>)}
    </div>
  );
}
