import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { useWs } from './workspace';
import { BookOpen, Bot, Coins, Cpu, MessageSquare, Plug } from 'lucide-react';
import { Mark } from './brand';
import vikingPhone from './assets/hero/viking-phone.webp';
import { CountUp, fmt, rise, stagger, Status, when } from './ui';

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
      <section className="home-hero" aria-labelledby="home-greeting">
        <div className="welcome">
          <motion.h1 id="home-greeting" className="grad-text" initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}>
            Good to see you{first ? <>, <span className="hello-name">{first}</span></> : ''}.</motion.h1>
          <p className="welcome-sub">Here is where {s?.name || 'your workspace'} stands today.</p>
          <p className="welcome-lede">Galdus is your team's AI workspace. Chat with any model, give it your company knowledge and let agents do the repetitive work.</p>
          <div className="welcome-cta">
            <button type="button" className="btn" onClick={() => go('chat')}><MessageSquare size={15} /> Start a chat</button>
            <button type="button" className="btn ghost" onClick={() => go('models')}><Plug size={15} /> Connect a model</button>
          </div>
        </div>
        <VikingScene />
      </section>

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

      <motion.section className="stats" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={rise} className="stat"><Coins className="ico" size={20} /><small>Tokens this month</small><b><CountUp value={s?.tokens_this_month} /></b>
          {s?.monthly_token_limit ? <small>of {fmt(s.monthly_token_limit)} allowed</small> : <small>No monthly limit</small>}</motion.div>
        <motion.div variants={rise} className="stat"><Cpu className="ico" size={20} /><small>Model connections</small><b><CountUp value={ws.sources.connections.length} /></b></motion.div>
        <motion.div variants={rise} className="stat"><BookOpen className="ico" size={20} /><small>Documents</small><b><CountUp value={docs} /></b></motion.div>
        <motion.div variants={rise} className="stat"><Bot className="ico" size={20} /><small>Agents</small><b><CountUp value={data.agents.length} /></b></motion.div>
      </motion.section>

      <section className="panel">
        <div className="panel-head"><div><h3>Recent activity</h3><p>Runs from agents, apps and automations.</p></div>
          <button type="button" className="btn ghost sm" onClick={() => go('chat')}><MessageSquare size={14} /> New chat</button></div>
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

// The chat is reproduced exactly as written in the brief. Do not edit the copy.
const SCENE_CHAT = [
  ['viking', 'Salute! Domani conquisto il villaggio vicino. Mi fai un piano?'],
  ['galdus', 'Certo! Quanti uomini hai?'],
  ['viking', '200 guerrieri, 40 navi, scudi e asce.'],
  ['galdus', 'Ottimo. Ho trovato tutto online, con spedizione gratuita. Procedo? 🛒'],
  ['viking', 'Si.'],
  ['galdus', 'Ordine effettuato! Consegna prevista tra 3-5 giorni lavorativi. 📦'],
  ['viking', 'Ma io attacco domani!'],
  ['galdus', "L'importante è partecipare."],
];

function VikingScene() {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { amount: .3 });
  const [shown, setShown] = useState(reduce ? SCENE_CHAT.length : 0);
  useEffect(() => {
    if (reduce) { setShown(SCENE_CHAT.length); return undefined; }
    if (!inView) return undefined;
    // Plays the conversation, holds on the punchline, then starts again.
    const t = setTimeout(() => setShown(n => (n >= SCENE_CHAT.length ? 0 : n + 1)),
      shown === 0 ? 700 : shown >= SCENE_CHAT.length ? 6000 : 1500);
    return () => clearTimeout(t);
  }, [shown, inView, reduce]);
  return (
    <figure className="scene" ref={ref}>
      <span className="scene-glow" aria-hidden="true" />
      <img className="scene-viking" src={vikingPhone} alt="A smiling Viking with the Galdus lime warpaint, chatting with Galdus on his phone"
        width="393" height="532" loading="lazy" decoding="async" />
      <div className="scene-bubble" aria-hidden="true">
        <div className="scene-head"><Mark size={16} interactive={false} /><b>Galdus</b><span className="scene-live"><i />online</span></div>
        <ol className={`scene-chat ${reduce ? 'static' : ''}`}>
          <AnimatePresence initial={false}>
            {SCENE_CHAT.slice(0, shown).map(([who, text], i) => (
              <motion.li key={i} layout={!reduce} className={`sbub ${who}`}
                initial={reduce ? false : { opacity: 0, y: 10, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: .2 } }}
                transition={{ duration: .3, ease: [.2, .7, .2, 1] }}>
                <b className="sbub-who">{who === 'viking' ? 'Vichingo' : 'Galdus'}:</b> {text}
              </motion.li>))}
          </AnimatePresence>
        </ol>
      </div>
      <figcaption className="sr-only">
        <ol>{SCENE_CHAT.map(([who, text], i) => <li key={i}>{who === 'viking' ? 'Vichingo' : 'Galdus'}: {text}</li>)}</ol>
      </figcaption>
    </figure>
  );
}
