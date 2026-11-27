import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Mark, Wordmark } from './brand';
import { useWs } from './workspace';
import { HomePage } from './home';
import { ChatPage } from './chat';
import { AppsPage } from './apps';
import { AgentsPage } from './agents';
import { KnowledgePage } from './knowledge';
import { AutomationsPage } from './automations';
import { ModelsPage } from './models';
import { IntegrationsPage } from './integrations';
import { TeamPage } from './team';
import { AdminPage } from './admin';
import { AccountPage } from './account';

export const NAV = [
  { group: 'Work', items: [['home', 'Home'], ['chat', 'Chat'], ['apps', 'Apps'], ['agents', 'Agents']] },
  { group: 'Data', items: [['knowledge', 'Knowledge']] },
  { group: 'Automate', items: [['automations', 'Automations']] },
  { group: 'Connect', items: [['models', 'Models'], ['integrations', 'Integrations']] },
  { group: 'Manage', items: [['team', 'Team'], ['account', 'Account']] },
];

const PAGES = {
  home: HomePage, chat: ChatPage, apps: AppsPage, agents: AgentsPage, knowledge: KnowledgePage,
  automations: AutomationsPage, models: ModelsPage, integrations: IntegrationsPage, team: TeamPage,
  admin: AdminPage, account: AccountPage,
};

function useRoute() {
  const read = () => {
    const r = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    return PAGES[r] ? r : 'home';
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback(r => { window.location.hash = `/${r}`; }, []);
  return [route, go];
}

export function Shell({ onLogout }) {
  const ws = useWs();
  const [route, go] = useRoute();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const nav = useMemo(() => ws.user?.is_platform_admin
    ? NAV.map(g => g.group === 'Manage' ? { ...g, items: [...g.items, ['admin', 'Platform admin']] } : g) : NAV, [ws.user]);
  const Page = PAGES[route] || HomePage;
  const navigate = r => { go(r); setDrawer(false); setPalette(false); };

  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
      if (e.key === 'Escape') { setPalette(false); setDrawer(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [route]);

  const initials = (ws.user?.full_name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${drawer ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand-row"><Mark size={30} /><Wordmark /></div>
        <label className="ws-switch">
          <span className="sr-only">Workspace</span>
          <select value={ws.organizationId} onChange={e => ws.setOrganizationId(e.target.value)} disabled={ws.organizations.length < 2}>
            {ws.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <LayoutGroup id="nav">
          <nav className="nav">
            {nav.map(g => (
              <div key={g.group} className="nav-group">
                <small>{g.group}</small>
                {g.items.map(([id, label]) => (
                  <button key={id} type="button" className={`nav-item ${route === id ? 'active' : ''}`}
                    aria-current={route === id ? 'page' : undefined} onClick={() => navigate(id)}>
                    <span className="slot">{route === id && <motion.span layoutId="nav-pixel" className="nav-pixel"
                      transition={{ type: 'spring', stiffness: 520, damping: 34 }} />}</span>
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </LayoutGroup>
        <div className="sidebar-foot">
          <button type="button" className="kbd-hint" onClick={() => setPalette(true)}>Go to… <span><kbd>Ctrl</kbd> <kbd>K</kbd></span></button>
          <div className="user-chip">
            <span className="avatar">{initials}</span>
            <div><b>{ws.user?.full_name}</b><small>{ws.user?.email}</small></div>
          </div>
          <button type="button" className="btn ghost sm" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <div className={`drawer-scrim ${drawer ? 'open' : ''}`} onClick={() => setDrawer(false)} />

      <div className="main">
        <header className="topbar">
          <button type="button" className="btn ghost sm" onClick={() => setDrawer(true)} aria-label="Open menu">Menu</button>
          <div className="brand-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Mark size={24} /><Wordmark /></div>
          <button type="button" className="btn quiet sm" onClick={() => setPalette(true)} aria-label="Search">Go to</button>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={`${route}-${ws.organizationId}`} className="page"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: .18, ease: [0.2, 0.8, 0.2, 1] }}>
            {ws.organizationId ? <Page go={navigate} /> : null}
          </motion.main>
        </AnimatePresence>
      </div>

      <AnimatePresence>{palette && <Palette nav={nav} onPick={navigate} onClose={() => setPalette(false)} />}</AnimatePresence>
    </div>
  );
}

function Palette({ nav, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const actions = [
    ...nav.flatMap(g => g.items.map(([id, label]) => ({ id, label, hint: g.group }))),
    { id: 'chat', label: 'Start a new chat', hint: 'Action' },
    { id: 'knowledge', label: 'Upload a document', hint: 'Action' },
    { id: 'agents', label: 'Create an agent', hint: 'Action' },
    { id: 'team', label: 'Invite a teammate', hint: 'Action' },
  ];
  const list = actions.filter(a => a.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="palette" role="dialog" aria-label="Go to" onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: .96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }}
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}>
        <input autoFocus value={q} placeholder="Where do you want to go?" onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && list[sel]) onPick(list[sel].id);
          }} />
        <ul>{list.map((a, i) => (
          <li key={a.label}><button type="button" className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(a.id)}>
            {a.label}<small>{a.hint}</small></button></li>
        ))}</ul>
      </motion.div>
    </motion.div>
  );
}
