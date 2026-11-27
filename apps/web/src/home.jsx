import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useWs } from './workspace';
import { BookOpen, Bot, Coins, Cpu, MessageSquare, Plug } from 'lucide-react';
import { Mark } from './brand';
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
  const list = { hidden: {}, show: { transition: { delayChildren: .3, staggerChildren: .55 } } };
  const item = { hidden: { opacity: 0, y: 10, scale: .97 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: .32, ease: [.2, .7, .2, 1] } } };
  return (
    <figure className="scene" aria-label="Example: a Viking joins the Galdus early access and chats with Galdus">
      <div className="phone" aria-hidden="true">
        <div className="phone-screen">
          <span className="phone-notch" />
          <div className="phone-bar"><Mark size={18} interactive={false} /><b>Galdus<i>.ai</i></b></div>
          <div className="phone-hero"><VikingPlaceholder /><b>Welcome aboard, Erik!</b><small>Your workspace is ready.</small></div>
          <div className="phone-card">
            <small>Early access</small>
            <span className="phone-field">erik@fjord.no</span>
            <span className="phone-btn">You're on the list</span>
          </div>
        </div>
      </div>
      <motion.ol className="scene-chat" variants={list} initial={reduce ? 'show' : 'hidden'} whileInView="show" viewport={{ once: true, amount: .15 }}>
        {SCENE_CHAT.map(([who, text], i) => (
          <motion.li key={i} className={`sbub ${who}`} variants={reduce ? undefined : item}>
            <span className="sbub-who">{who === 'viking' ? 'Vichingo' : 'Galdus'}</span>
            <span className="sbub-text">{text}</span>
          </motion.li>
        ))}
      </motion.ol>
    </figure>
  );
}

/* PLACEHOLDER illustration: replace with the final Viking artwork when available
   (keep the data-placeholder attribute until then so it is easy to find). */
function VikingPlaceholder() {
  return (
    <svg className="viking-ph" data-placeholder="viking-illustration" viewBox="0 0 160 150" role="img" aria-label="Smiling Viking (placeholder)">
      <defs>
        <linearGradient id="vk-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D8FF66" /><stop offset="1" stopColor="#B6FF00" /></linearGradient>
        <linearGradient id="vk-helm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2C4F80" /><stop offset="1" stopColor="#173763" /></linearGradient>
      </defs>
      <rect width="160" height="150" rx="22" fill="url(#vk-bg)" />
      <path d="M44 62C30 58 22 44 26 28c5 12 14 18 26 20z" fill="#F8FAFC" stroke="#0B1F3B" strokeWidth="2" />
      <path d="M116 62c14-4 22-18 18-34-5 12-14 18-26 20z" fill="#F8FAFC" stroke="#0B1F3B" strokeWidth="2" />
      <ellipse cx="80" cy="88" rx="36" ry="38" fill="#F2C9A0" />
      <path d="M42 70c0-26 16-42 38-42s38 16 38 42z" fill="url(#vk-helm)" />
      <rect x="38" y="64" width="84" height="11" rx="5.5" fill="#0B1F3B" />
      <circle cx="58" cy="69.5" r="2" fill="#9DB0CB" /><circle cx="80" cy="69.5" r="2" fill="#9DB0CB" /><circle cx="102" cy="69.5" r="2" fill="#9DB0CB" />
      <path d="M48 94c20-5 44-5 64 0" stroke="#B6FF00" strokeWidth="7" strokeLinecap="round" opacity=".8" />
      <path d="M58 88q6-7 12 0M90 88q6-7 12 0" stroke="#0B1F3B" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="56" cy="100" r="5" fill="#F29C8A" opacity=".5" /><circle cx="104" cy="100" r="5" fill="#F29C8A" opacity=".5" />
      <path d="M44 98c2 30 18 48 36 48s34-18 36-48c-6 10-16 14-24 12-4-4-20-4-24 0-8 2-18-2-24-12z" fill="#C9763A" />
      <path d="M68 112q12 14 24 0z" fill="#7A2E1E" stroke="#0B1F3B" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M70 113h20" stroke="#F8FAFC" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M80 104c-6-4-14-4-18 2 6 1 12 0 18-2zm0 0c6-4 14-4 18 2-6 1-12 0-18-2z" fill="#A65E2B" />
      <ellipse cx="80" cy="99" rx="4.5" ry="3.5" fill="#E2A97E" />
      <path d="M80 124v14" stroke="#A65E2B" strokeWidth="3" strokeLinecap="round" />
      <circle cx="80" cy="140" r="3.4" fill="#B6FF00" stroke="#0B1F3B" strokeWidth="1.5" />
    </svg>
  );
}
