// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Settings2 } from 'lucide-react';
import { useWs } from './workspace';
import { CopyField, HowTo, WizardFrame } from './wizardkit';
import { fmt, PageHead, when } from './ui';

export function AdminPage() {
  const ws = useWs();
  const [tab, setTab] = useState(() => (window.location.hash.includes('setup') ? 'setup' : 'overview'));
  const [d, setD] = useState(null);
  const load = useCallback(async () => {
    try {
      const [overview, users, orgs, usage] = await Promise.all(['overview', 'users', 'organizations', 'usage?days=14'].map(p => ws.call(`/v1/admin/${p}`)));
      setD({ overview, users, orgs, usage });
    } catch (err) { ws.onError(err); }
  }, [ws]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function toggleAdmin(u) {
    try { await ws.call(`/v1/admin/users/${u.id}/admin`, { method: 'POST', body: { is_platform_admin: !u.is_platform_admin } }); load(); } catch (err) { ws.onError(err); }
  }
  const tabs = (
    <div className="seg" role="tablist" aria-label="Platform admin">
      {[['overview', 'Overview'], ['setup', 'Setup']].map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}
    </div>);
  if (tab === 'setup') return (
    <div className="stack">
      <PageHead title="Platform admin" actions={tabs}>Turn on sign-in with Google, GitHub and Microsoft, cloud drives, email and the scheduler. Each card guides you step by step.</PageHead>
      <SetupPanel />
    </div>);
  if (!d) return <PageHead title="Platform admin" actions={tabs}>Loading…</PageHead>;
  const o = d.overview;
  const tiles = [['Users', o.users], ['Workspaces', o.organizations], ['New users, 7 days', o.new_users_7d], ['Requests, 24 h', o.requests_24h], ['Tokens, 24 h', o.tokens_24h], ['Tokens, all time', o.tokens_total]];
  return (
    <div className="stack">
      <PageHead title="Platform admin" actions={<>{tabs}<button type="button" className="btn ghost" onClick={load}>Refresh</button></>}>Every workspace on this Galdus installation. Visible to platform administrators only.</PageHead>
      <div className="cols-3">{tiles.map(([l, v]) => <div key={l} className="stat"><small>{l}</small><b>{fmt(v)}</b></div>)}</div>
      <div className="panel"><h3 style={{ marginBottom: 12 }}>Users</h3><div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Workspaces</th><th>Tokens 24 h</th><th>Last request</th><th>Joined</th><th>Admin</th></tr></thead>
        <tbody>{d.users.map(u => <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.organizations}</td><td className="num">{fmt(u.tokens_24h)}</td>
          <td>{when(u.last_request_at)}</td><td>{when(u.created_at)}</td>
          <td><button type="button" className="btn quiet sm" disabled={u.id === ws.user.id} onClick={() => toggleAdmin(u)}>{u.is_platform_admin ? 'Revoke admin' : 'Make admin'}</button></td></tr>)}</tbody></table></div></div>
      <div className="cols">
        <div className="panel"><h3 style={{ marginBottom: 12 }}>Workspaces</h3><div className="table-wrap"><table><thead><tr><th>Name</th><th>Members</th><th>Tokens</th></tr></thead>
          <tbody>{d.orgs.map(g => <tr key={g.id}><td>{g.name}</td><td>{g.members}</td><td className="num">{fmt(g.tokens_total)}</td></tr>)}</tbody></table></div></div>
        <div className="panel"><h3 style={{ marginBottom: 12 }}>Usage, 14 days</h3>{d.usage.length === 0 ? <p className="muted">No requests yet.</p> : <div className="table-wrap"><table>
          <thead><tr><th>Day</th><th>Model</th><th>Requests</th><th>Tokens</th></tr></thead>
          <tbody>{d.usage.map(r => <tr key={r.day + r.model}><td>{r.day}</td><td>{r.model}</td><td className="num">{r.requests}</td><td className="num">{fmt(r.tokens)}</td></tr>)}</tbody></table></div>}</div>
      </div>
    </div>
  );
}

const RENDER_STEPS = ['Open dashboard.render.com and the galdus-api service.', 'Go to Environment and add each variable below with its value.', 'Choose Save changes: Render restarts the API in about two minutes.'];
const GUIDES = {
  encryption: { title: 'Encryption key', what: 'Encrypts the model keys and drive tokens each workspace stores.', critical: true,
    steps: ['Generate a long random value, for example with: python -c "import secrets; print(secrets.token_urlsafe(48))"', 'Keep a copy in your password manager: if it changes, stored keys can no longer be read.'] },
  admins: { title: 'Platform administrators', what: 'Who sees this console. People with these emails become admins once their address is confirmed (email link, Google or GitHub).',
    steps: ['List the emails, separated by commas.', 'People who already have an account: use Make admin in Overview, Users.'] },
  google: { title: 'Sign in with Google and Google Drive', what: 'One-click sign-in with Google, and importing Drive files into knowledge.', link: 'https://console.cloud.google.com/apis/credentials',
    steps: ['In Google Cloud, create a project, then open APIs and services.', 'OAuth consent screen: choose External, fill in the app name and your email, then Publish app.', 'Library: enable the Google Drive API (only needed for Drive).', 'Credentials: Create credentials, OAuth client ID, type Web application. Add both redirect URIs below.', 'Copy the client ID and the client secret.'] },
  github: { title: 'Sign in with GitHub', what: 'One-click sign-in with a GitHub account.', link: 'https://github.com/settings/developers',
    steps: ['On GitHub open Settings, Developer settings, OAuth Apps, New OAuth App.', 'Homepage URL: the console address below. Authorization callback URL: the redirect URI below.', 'Register the app, then Generate a new client secret.', 'Copy the client ID and the client secret.'] },
  microsoft: { title: 'Sign in with Microsoft, SharePoint and OneDrive', what: 'One-click sign-in with a Microsoft account, and importing files from SharePoint and OneDrive into knowledge.', link: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    steps: ['In Microsoft Entra, App registrations, New registration. Accounts: any organizational directory and personal accounts.', 'Redirect URIs: platform Web, both addresses below (sign-in and drives).', 'Certificates and secrets: New client secret, copy its value.', 'API permissions, Microsoft Graph, delegated: User.Read, Files.Read.All, Sites.Read.All, offline_access.', 'Copy the Application (client) ID. MICROSOFT_TENANT can stay common.'] },
  email: { title: 'Email', what: 'Password reset and invitation emails.', link: 'https://www.brevo.com/products/transactional-email/',
    steps: ['Pick any SMTP provider (Brevo, Resend, Mailgun, Amazon SES). Several have a free tier.', 'Verify the sender address or domain with the provider.', 'Copy the SMTP host, port (usually 587), user and password. SMTP_FROM is the sender, for example Galdus <no-reply@yourdomain.com>.'] },
  scheduler: { title: 'Automation scheduler', what: 'Runs scheduled automations and the daily drive re-sync, every 15 minutes, for free with GitHub Actions.',
    steps: ['Generate a long random value as for the encryption key.', 'Set it as AUTOMATION_TOKEN on Render (next step).', 'On GitHub open the repository Settings, Secrets and variables, Actions, and add GALDUS_AUTOMATION_TOKEN with the same value.'] },
};

function SetupPanel() {
  const ws = useWs();
  const [s, setS] = useState(null);
  const [open, setOpen] = useState('');
  const load = useCallback(() => ws.call('/v1/admin/setup').then(setS).catch(ws.onError), [ws]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const done = s.items.filter(i => i.enabled).length;
  return (
    <>
      <div className="panel setup-progress"><b>{done} of {s.items.length} ready</b>
        <div className="bar"><span style={{ width: `${(done / s.items.length) * 100}%` }} /></div>
        <small className="muted">API {s.public_api_url}, console {s.frontend_url}</small></div>
      <div className="prov-grid">{s.items.map(i => {
        const g = GUIDES[i.id];
        return (
          <button key={i.id} type="button" className="prov-card" onClick={() => setOpen(i.id)}>
            <span className={`setup-ico ${i.enabled ? 'ok' : ''}`}>{i.enabled ? <CheckCircle2 size={22} /> : <CircleDashed size={22} />}</span>
            <b>{g.title}</b><small>{g.what}</small><span />
            <span className="prov-foot"><span className={`gs-badge ${i.enabled ? 'ok' : g.critical ? 'warn' : ''}`}>{i.enabled ? 'Active' : g.critical ? 'Required' : 'Off'}</span>
              <span className="prov-cta">{i.enabled ? 'Review' : 'Set up'}</span></span>
          </button>);
      })}</div>
      <AnimatePresence>{open && <SetupWizard key={open} item={s.items.find(i => i.id === open)} setup={s} onClose={() => { setOpen(''); load(); }} />}</AnimatePresence>
    </>
  );
}

function SetupWizard({ item, setup, onClose }) {
  const ws = useWs();
  const g = GUIDES[item.id];
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState(item.enabled);
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    try { const s = await ws.call('/v1/admin/setup'); setStatus(s.items.find(i => i.id === item.id)?.enabled); } catch (err) { ws.onError(err); } finally { setChecking(false); }
  }
  const footer = (
    <>
      {step > 0 ? <button type="button" className="btn quiet" onClick={() => setStep(x => x - 1)}><ArrowLeft size={15} /> Back</button> : <span />}
      {step < 2 ? <button type="button" className="btn" onClick={() => setStep(x => x + 1)}>Continue <ArrowRight size={15} /></button>
        : <button type="button" className="btn" disabled={checking} onClick={check}>{checking ? 'Checking…' : 'Check again'}</button>}
    </>);
  return (
    <WizardFrame icon={<Settings2 size={18} />} title={g.title} subtitle={g.what} steps={['Prepare', 'Add to Render', 'Check']} step={step} onClose={onClose} footer={footer}>
      {step === 0 && <div className="wz-form">
        <HowTo steps={g.steps} />
        {item.redirect_uris?.map((u, i) => <CopyField key={u} label={item.redirect_uris.length > 1 ? (i === 0 ? 'Redirect URI for sign-in' : 'Redirect URI for Drive') : 'Redirect URI'} value={u} toast={ws.toast} />)}
        {item.id === 'github' && <CopyField label="Homepage URL" value={setup.frontend_url} toast={ws.toast} />}
        {g.link && <a className="btn ghost sm" href={g.link} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>Open the console <ExternalLink size={14} /></a>}
      </div>}
      {step === 1 && <div className="wz-form">
        <HowTo steps={RENDER_STEPS} />
        <div className="stack" style={{ gap: 8 }}>{item.env.map(e => <CopyField key={e} label="Variable name" value={e} toast={ws.toast} />)}</div>
        {item.github_secret && <CopyField label="GitHub Actions secret, same value" value={item.github_secret} toast={ws.toast} />}
        <p className="wz-note">Values never go through Galdus or this page: paste them only in Render{item.github_secret ? ' and GitHub' : ''}.</p>
      </div>}
      {step === 2 && <div className="wz-form" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <span className={`setup-big ${status ? 'ok' : ''}`}>{status ? <CheckCircle2 size={48} /> : <CircleDashed size={48} />}</span>
        <h3 style={{ margin: 0 }}>{status ? `${g.title} is active` : 'Not active yet'}</h3>
        <p className="muted" style={{ margin: 0, maxWidth: 440 }}>{status ? 'Everyone on this installation can use it now.' : 'After saving on Render, wait for the restart (about two minutes), then check again.'}</p>
      </div>}
    </WizardFrame>
  );
}
