import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from './config';
import { RunView } from './runview';
import { useWs } from './workspace';
import { Select } from './select';
import { AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Bell, CalendarClock, MessageSquare, Webhook, Workflow } from 'lucide-react';
import { CopyField, Done, HowTo, WizardFrame } from './wizardkit';
import { Empty, PageHead, Status, when } from './ui';

const PRESETS = [['Every weekday at 08:00 UTC', '0 8 * * 1-5'], ['Every day at 07:00 UTC', '0 7 * * *'], ['Every Monday at 09:00 UTC', '0 9 * * 1'], ['Every hour', '0 * * * *'], ['Custom', 'custom']];

export function AutomationsPage({ go }) {
  const ws = useWs();
  const [items, setItems] = useState([]);
  const [agents, setAgents] = useState([]);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState('');
  const [runs, setRuns] = useState({ id: '', list: [] });
  const load = () => ws.call('/v1/automations').then(setItems).catch(ws.onError);
  useEffect(() => { load(); ws.call('/v1/agents').then(setAgents).catch(ws.onError); }, [ws.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runNow(a) {
    setRunning(a.id);
    try { const r = await ws.call(`/v1/automations/${a.id}/run`, { method: 'POST' }); ws.toast(r.status === 'succeeded' ? 'Run finished. See the history.' : `Run ${r.status}.`, r.status === 'succeeded' ? undefined : 'warn'); load(); showRuns(a); }
    catch (err) { ws.onError(err); } finally { setRunning(''); }
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
      <AnimatePresence>{creating && <AutomationWizard key="auto" agents={agents} onClose={changed => { setCreating(false); if (changed) load(); }} />}</AnimatePresence>
      {items.length === 0 && !creating ? <Empty title="No automations yet" action={ws.canManage && <button type="button" className="btn" onClick={() => setCreating(true)}>Create your first automation</button>}>Run an agent every morning, or whenever another tool calls a webhook, and send the result to Slack or Teams.</Empty> : (
        <div className="stack">{items.map(a => (
          <div key={a.id} className="panel">
            <div className="panel-head"><div><h3>{a.name}</h3>
              <p>{a.agent_name}. {a.cron ? `Schedule ${a.cron} (UTC), next ${when(a.next_run_at)}.` : 'No schedule.'} {a.webhook ? 'Webhook on.' : ''} {a.delivers ? 'Delivers results.' : ''}</p></div>
              <div className="actions">{a.enabled ? <Status status={a.last_status} /> : <span className="chip warn"><span className="px" />Paused</span>}
                <button type="button" className="btn ghost sm" onClick={() => showRuns(a)}>History</button>
                {ws.canManage && a.enabled && <button type="button" className="btn ghost sm" disabled={running === a.id} onClick={() => runNow(a)}>{running === a.id ? 'Running…' : 'Run now'}</button>}
                {ws.canManage && <><button type="button" className="btn ghost sm" onClick={() => toggle(a)}>{a.enabled ? 'Pause' : 'Resume'}</button>
                  <button type="button" className="btn quiet sm" onClick={() => remove(a)}>Delete</button></>}</div></div>
            {runs.id === a.id && (runs.list.length ? <div className="stack">{runs.list.slice(0, 3).map(r => <RunView key={r.id} run={r} />)}</div> : <p className="muted small">No runs yet.</p>)}
          </div>))}</div>)}
    </div>
  );
}

const DELIVERY = [
  { id: 'none', label: 'Keep in Galdus', icon: Bell, text: 'Read the result in the automation history.' },
  { id: 'slack', label: 'Slack', icon: MessageSquare, text: 'Post to a channel with an incoming webhook.', link: 'https://api.slack.com/messaging/webhooks',
    steps: ['In Slack, create an app (or open yours) and turn on Incoming Webhooks.', 'Choose Add New Webhook to Workspace and pick the channel.', 'Copy the address that starts with https://hooks.slack.com/ and paste it below.'] },
  { id: 'teams', label: 'Microsoft Teams', icon: MessageSquare, text: 'Post to a channel with a Workflows webhook.', link: 'https://support.microsoft.com/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498',
    steps: ['In the Teams channel, open Workflows.', 'Choose the template Post to a channel when a webhook request is received.', 'Finish the template and copy the webhook address it shows.'] },
  { id: 'webhook', label: 'Other webhook', icon: Webhook, text: 'Any https endpoint: n8n, Make, Zapier, your ITSM.',
    steps: ['Create an endpoint that accepts a POST with JSON.', 'Galdus sends the agent result in the text field, plus automation and run details.', 'Paste the https address below.'] },
];

function AutomationWizard({ agents, onClose }) {
  const ws = useWs();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', agent_id: agents[0]?.id || '', input: '', schedule: true, preset: PRESETS[0][1], cron: '', webhook: false, delivery: 'none', deliver_url: '' });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const d = DELIVERY.find(x => x.id === f.delivery);
  const cron = f.schedule ? (f.preset === 'custom' ? f.cron.trim() : f.preset) : null;
  const ok = [f.name.trim() && f.agent_id && f.input.trim(), (f.schedule || f.webhook) && (!f.schedule || cron), f.delivery === 'none' || /^https:\/\//.test(f.deliver_url.trim()), true];

  async function create() {
    setBusy(true); setError('');
    try {
      const a = await ws.call('/v1/automations', { method: 'POST', body: { name: f.name.trim(), agent_id: f.agent_id, input: f.input.trim(), cron, webhook: f.webhook,
        deliver_url: f.delivery === 'none' ? null : f.deliver_url.trim() } });
      setCreated(a); setStep(4);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function tryNow() {
    setBusy(true);
    try { setResult(await ws.call(`/v1/automations/${created.id}/run`, { method: 'POST' })); } catch (err) { setResult({ status: 'failed', error: err.message }); } finally { setBusy(false); }
  }
  const presetLabel = (PRESETS.find(p => p[1] === f.preset) || [])[0];
  const footer = (
    <>
      {step > 0 && step < 4 ? <button type="button" className="btn quiet" onClick={() => setStep(s => s - 1)}><ArrowLeft size={15} /> Back</button> : <span />}
      {step < 3 && <button type="button" className="btn" disabled={!ok[step]} onClick={() => setStep(s => s + 1)}>Continue <ArrowRight size={15} /></button>}
      {step === 3 && <button type="button" className="btn" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create automation'}</button>}
      {step === 4 && <button type="button" className="btn" onClick={() => onClose(true)}>Done</button>}
    </>);
  return (
    <WizardFrame icon={<Workflow size={18} />} title="New automation" subtitle="An agent that works on its own, on a schedule or on demand."
      steps={['Task', 'Trigger', 'Delivery', 'Review', 'Ready']} step={step} onClose={() => onClose(!!created)} footer={footer}>
      {step === 0 && <div className="wz-form">
        <div className="form-grid">
          <label className="field">Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={120} placeholder="Monday service report" autoFocus /></label>
          <label className="field">Agent<Select value={f.agent_id} onChange={v => setF({ ...f, agent_id: v })} options={agents.map(a => ({ value: a.id, label: a.name, hint: a.description }))} /></label>
        </div>
        <label className="field">What the agent should do each time<small>Written like a request in chat. A webhook can add details, for example the new ticket.</small>
          <textarea value={f.input} onChange={e => setF({ ...f, input: e.target.value })} maxLength={20000} placeholder="Summarise last week's incidents and list open risks." style={{ minHeight: 120 }} /></label>
      </div>}
      {step === 1 && <div className="wz-form">
        <div className="choice-grid">
          <button type="button" className={`choice ${f.schedule ? 'on' : ''}`} onClick={() => setF({ ...f, schedule: !f.schedule })} aria-pressed={f.schedule}>
            <CalendarClock size={22} /><b>On a schedule</b><small>Every day, every Monday, every hour…</small></button>
          <button type="button" className={`choice ${f.webhook ? 'on' : ''}`} onClick={() => setF({ ...f, webhook: !f.webhook })} aria-pressed={f.webhook}>
            <Webhook size={22} /><b>When called</b><small>n8n, Make, Zapier or your ticketing tool call a private address.</small></button>
        </div>
        {f.schedule && <div className="form-grid">
          <label className="field">When<Select value={f.preset} onChange={v => setF({ ...f, preset: v })} options={PRESETS.map(([l, v]) => ({ value: v, label: l }))} /></label>
          {f.preset === 'custom' && <label className="field">Cron expression<small>Five fields, UTC, at most every 15 minutes.</small><input value={f.cron} onChange={e => setF({ ...f, cron: e.target.value })} placeholder="30 6 * * 1-5" /></label>}
        </div>}
        {!f.schedule && !f.webhook && <p className="wz-warn">Choose at least one way to start the automation.</p>}
      </div>}
      {step === 2 && <div className="wz-form">
        <div className="choice-grid four">{DELIVERY.map(x => (
          <button key={x.id} type="button" className={`choice ${f.delivery === x.id ? 'on' : ''}`} onClick={() => setF({ ...f, delivery: x.id })} aria-pressed={f.delivery === x.id}>
            <x.icon size={22} /><b>{x.label}</b><small>{x.text}</small></button>))}</div>
        {d.steps && <>
          <HowTo steps={d.steps} />
          {d.link && <a className="btn ghost sm" href={d.link} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>Open the {d.label} guide</a>}
          <label className="field">Webhook address<input type="url" value={f.deliver_url} onChange={e => setF({ ...f, deliver_url: e.target.value })}
            placeholder={f.delivery === 'slack' ? 'https://hooks.slack.com/services/…' : 'https://…'} /></label>
        </>}
      </div>}
      {step === 3 && <div className="wz-form">
        <dl className="review">
          <div><dt>Name</dt><dd>{f.name}</dd></div>
          <div><dt>Agent</dt><dd>{agents.find(a => a.id === f.agent_id)?.name}</dd></div>
          <div><dt>Request</dt><dd>{f.input}</dd></div>
          <div><dt>Starts</dt><dd>{[f.schedule && (f.preset === 'custom' ? `Cron ${f.cron} (UTC)` : presetLabel), f.webhook && 'When its webhook is called'].filter(Boolean).join(', and ')}</dd></div>
          <div><dt>Result</dt><dd>{f.delivery === 'none' ? 'Kept in Galdus' : `Sent to ${d.label}`}</dd></div>
        </dl>
        {f.schedule && <p className="wz-note"><CalendarClock size={15} />Schedules run when the platform scheduler is on. Platform admins can check it under Platform admin, Setup.</p>}
        {error && <div className="wz-error"><b>Could not create the automation</b><span>{error}</span></div>}
      </div>}
      {step === 4 && created && <div className="wz-form">
        <Done title={`${created.name} is ready`}><p className="muted">{created.next_run_at ? `Next run ${when(created.next_run_at)}.` : 'It runs when its webhook is called.'}</p></Done>
        {created.webhook_path && <CopyField label="Webhook address, shown only now. Treat it like a password." value={`${API_BASE_URL.replace(/\/api$/, '')}${created.webhook_path}`} toast={ws.toast} />}
        <div className="actions" style={{ justifyContent: 'center' }}><button type="button" className="btn ghost" disabled={busy} onClick={tryNow}>{busy ? 'Running…' : 'Try it now'}</button></div>
        {result && <div className={result.status === 'succeeded' ? 'wz-ok' : 'wz-error'}><b>{result.status === 'succeeded' ? 'It worked' : 'The run failed'}</b><span>{result.output || result.error}</span></div>}
      </div>}
    </WizardFrame>
  );
}
