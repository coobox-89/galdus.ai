import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useWs } from './workspace';
import { fmt, Status, when } from './ui';

export function HomePage({ go }) {
  const ws = useWs();
  const [data, setData] = useState({ agents: [], runs: [], settings: null, automations: [] });
  useEffect(() => {
    Promise.all([ws.call('/v1/agents'), ws.call('/v1/runs?limit=8'), ws.call('/v1/org/settings'), ws.call('/v1/automations')])
      .then(([agents, runs, settings, automations]) => setData({ agents, runs, settings, automations })).catch(ws.onError);
  }, [ws.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const docs = ws.collections.reduce((n, c) => n + c.documents, 0);
  const steps = [
    ['Connect a model', 'Add a provider key. Any model, including open-weight ones.', ws.sources.connections.length > 0 || ws.sources.platform.length > 0, 'models'],
    ['Add your knowledge', 'Upload documents or import a web page into a collection.', docs > 0, 'knowledge'],
    ['Create an agent', 'Give it instructions, knowledge and tools.', data.agents.length > 0, 'agents'],
    ['Automate it', 'Run the agent on a schedule or from a webhook.', data.automations.length > 0, 'automations'],
  ];
  const first = ws.user?.full_name?.split(' ')[0];
  const s = data.settings;

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="welcome">
        <h1>Good to see you{first ? `, ${first}` : ''}.</h1>
        <p className="muted" style={{ margin: '8px 0 0' }}>Here is where {s?.name || 'your workspace'} stands today.</p>
      </div>

      <section>
        <div className="panel-head"><div><h3>Set up your workspace</h3><p>Four steps from zero to a running AI workflow.</p></div></div>
        <ol className="steps">
          {steps.map(([title, text, done, route], i) => (
            <motion.li key={title} className={`step ${done ? 'done' : ''}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .06 }}>
              <span className="n">{done ? 'Done' : `Step ${i + 1}`}</span>
              <b>{title}</b><p>{text}</p>
              <div><button type="button" className={`btn sm ${done ? 'ghost' : ''}`} onClick={() => go(route)}>{done ? 'Open' : 'Start'}</button></div>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="stats">
        <div className="stat"><small>Tokens this month</small><b>{fmt(s?.tokens_this_month)}</b>
          {s?.monthly_token_limit ? <small>of {fmt(s.monthly_token_limit)} allowed</small> : <small>No monthly limit</small>}</div>
        <div className="stat"><small>Model connections</small><b>{ws.sources.connections.length}</b></div>
        <div className="stat"><small>Documents</small><b>{fmt(docs)}</b></div>
        <div className="stat"><small>Agents</small><b>{data.agents.length}</b></div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>Recent activity</h3><p>Runs from agents, apps and automations.</p></div>
          <button type="button" className="btn ghost sm" onClick={() => go('chat')}>New chat</button></div>
        {data.runs.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing has run yet. Try an app or an agent.</p> : (
          <div className="table-wrap"><table><thead><tr><th>When</th><th>Source</th><th>Request</th><th>Status</th></tr></thead>
            <tbody>{data.runs.map(r => (
              <tr key={r.id}><td>{when(r.created_at)}</td><td>{r.app_id ? `App: ${r.app_id}` : r.trigger !== 'manual' ? `Automation (${r.trigger})` : 'Agent'}</td>
                <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.input.slice(0, 80)}</td><td><Status status={r.status} /></td></tr>))}
            </tbody></table></div>)}
      </section>
    </div>
  );
}
