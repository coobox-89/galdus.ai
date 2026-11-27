import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from './config';
import { RunView } from './runview';
import { useWs } from './workspace';
import { Empty, PageHead, Status, when } from './ui';

const PRESETS = [['Every weekday at 08:00 UTC', '0 8 * * 1-5'], ['Every day at 07:00 UTC', '0 7 * * *'], ['Every Monday at 09:00 UTC', '0 9 * * 1'], ['Every hour', '0 * * * *'], ['Custom', 'custom']];

export function AutomationsPage({ go }) {
  const ws = useWs();
  const [items, setItems] = useState([]);
  const [agents, setAgents] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', agent_id: '', input: '', preset: PRESETS[0][1], cron: '', schedule: true, webhook: false, deliver_url: '' });
  const [secret, setSecret] = useState(null);
  const [runs, setRuns] = useState({ id: '', list: [] });
  const load = () => ws.call('/v1/automations').then(setItems).catch(ws.onError);
  useEffect(() => { load(); ws.call('/v1/agents').then(a => { setAgents(a); setForm(f => ({ ...f, agent_id: a[0]?.id || '' })); }).catch(ws.onError); }, [ws.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e) {
    e.preventDefault();
    const cron = form.schedule ? (form.preset === 'custom' ? form.cron : form.preset) : null;
    try {
      const a = await ws.call('/v1/automations', { method: 'POST', body: { name: form.name, agent_id: form.agent_id, input: form.input,
        cron, webhook: form.webhook, deliver_url: form.deliver_url || null } });
      if (a.webhook_path) setSecret(`${API_BASE_URL.replace(/\/api$/, '')}${a.webhook_path}`);
      ws.toast('Automation created.'); setCreating(false); load();
    } catch (err) { ws.onError(err); }
  }
  async function toggle(a) {
    try { await ws.call(`/v1/automations/${a.id}`, { method: 'PATCH', body: { enabled: !a.enabled } }); ws.toast(a.enabled ? 'Automation paused.' : 'Automation resumed.'); load(); } catch (err) { ws.onError(err); }
  }
  async function remove(a) {
    if (!window.confirm(`Delete "${a.name}"?`)) return;
    try { await ws.call(`/v1/automations/${a.id}`, { method: 'DELETE' }); ws.toast('Automation deleted.'); load(); } catch (err) { ws.onError(err); }
  }
  const showRuns = a => ws.call(`/v1/automations/${a.id}/runs`).then(list => setRuns({ id: a.id, list })).catch(ws.onError);

  if (!agents.length) return (
    <div className="stack"><PageHead title="Automations">Run agents on a schedule or when another tool calls a webhook.</PageHead>
      <Empty title="Create an agent first" action={<button type="button" className="btn" onClick={() => go('agents')}>Go to agents</button>}>Automations run one of your agents with a fixed request.</Empty></div>);

  return (
    <div className="stack">
      <PageHead title="Automations" actions={ws.canManage && !creating && <button type="button" className="btn" onClick={() => setCreating(true)}>New automation</button>}>
        Run agents on a schedule or when another tool calls a webhook, and send the result to Slack, Teams or any webhook.
      </PageHead>
      {secret && (
        <div className="secret-box"><b>Webhook address, shown once</b>
          <span className="small muted">Send a POST with JSON {'{"input": "…"}'} from n8n, Make, Zapier or your ticketing tool. Treat it like a password.</span>
          <code>{secret}</code><div className="actions"><button type="button" className="btn sm" onClick={() => { navigator.clipboard?.writeText(secret); ws.toast('Copied.'); }}>Copy</button>
            <button type="button" className="btn ghost sm" onClick={() => setSecret(null)}>I saved it</button></div></div>)}
      {creating && (
        <form className="panel form" onSubmit={create}>
          <h2>New automation</h2>
          <div className="form-grid">
            <label className="field">Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={120} placeholder="Monday service report" /></label>
            <label className="field">Agent<select value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })}>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="field span">Request for the agent<textarea value={form.input} onChange={e => setForm({ ...form, input: e.target.value })} required maxLength={20000} placeholder="Summarise last week's incidents and list open risks." /></label>
          </div>
          <label className="check"><input type="checkbox" checked={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.checked })} /><span>Run on a schedule</span></label>
          {form.schedule && <div className="form-grid">
            <label className="field">When<select value={form.preset} onChange={e => setForm({ ...form, preset: e.target.value })}>{PRESETS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {form.preset === 'custom' && <label className="field">Cron expression<small>Five fields, UTC, at most every 15 minutes.</small><input value={form.cron} onChange={e => setForm({ ...form, cron: e.target.value })} placeholder="30 6 * * 1-5" required /></label>}
          </div>}
          <label className="check"><input type="checkbox" checked={form.webhook} onChange={e => setForm({ ...form, webhook: e.target.checked })} />
            <span>Run when a webhook is called<small>Other tools can send extra input, for example a new ticket.</small></span></label>
          <label className="field">Send the result to (optional)<small>A Slack or Teams incoming webhook, or any https endpoint.</small>
            <input type="url" value={form.deliver_url} onChange={e => setForm({ ...form, deliver_url: e.target.value })} placeholder="https://hooks.slack.com/services/…" /></label>
          <div className="actions"><button className="btn" disabled={!form.schedule && !form.webhook}>Create automation</button><button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button></div>
        </form>)}
      {items.length === 0 && !creating ? <Empty title="No automations yet">Schedules need the scheduler set up once by the platform owner (see the deployment guide).</Empty> : (
        <div className="stack">{items.map(a => (
          <div key={a.id} className="panel">
            <div className="panel-head"><div><h3>{a.name}</h3>
              <p>{a.agent_name}. {a.cron ? `Schedule ${a.cron} (UTC), next ${when(a.next_run_at)}.` : 'No schedule.'} {a.webhook ? 'Webhook on.' : ''} {a.delivers ? 'Delivers results.' : ''}</p></div>
              <div className="actions">{a.enabled ? <Status status={a.last_status} /> : <span className="chip warn"><span className="px" />Paused</span>}
                <button type="button" className="btn ghost sm" onClick={() => showRuns(a)}>History</button>
                {ws.canManage && <><button type="button" className="btn ghost sm" onClick={() => toggle(a)}>{a.enabled ? 'Pause' : 'Resume'}</button>
                  <button type="button" className="btn quiet sm" onClick={() => remove(a)}>Delete</button></>}</div></div>
            {runs.id === a.id && (runs.list.length ? <div className="stack">{runs.list.slice(0, 3).map(r => <RunView key={r.id} run={r} />)}</div> : <p className="muted small">No runs yet.</p>)}
          </div>))}</div>)}
    </div>
  );
}
