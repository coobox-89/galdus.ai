import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, Copy, Download, KeyRound, MailWarning, ShieldCheck, Smartphone, Trash2, Upload } from 'lucide-react';
import { useWs } from './workspace';
import { Done, HowTo, WizardFrame } from './wizardkit';

export const initialsOf = name => (name || '?').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();

export function Avatar({ user, size = 32, className = '' }) {
  return user?.avatar
    ? <img className={`avatar img ${className}`} src={user.avatar} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: Math.max(11, size * .38) }}>{initialsOf(user?.full_name)}</span>;
}

// ---- Photo editor: drag to frame, zoom, saved as a 256 px WebP -----------------
const OUT = 256, VIEW = 240;

function PhotoEditor({ file, onCancel, onSave }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);
  const canvas = useRef(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image(); i.onload = () => setImg(i); i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const base = img ? VIEW / Math.min(img.width, img.height) : 1;
  const clamp = (p, z = zoom) => {
    if (!img) return p;
    const w = img.width * base * z, h = img.height * base * z;
    const mx = Math.max(0, (w - VIEW) / 2), my = Math.max(0, (h - VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  useEffect(() => {
    if (!img || !canvas.current) return;
    const c = canvas.current, ctx = c.getContext('2d');
    c.width = c.height = VIEW * 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, VIEW, VIEW);
    const w = img.width * base * zoom, h = img.height * base * zoom;
    ctx.drawImage(img, (VIEW - w) / 2 + pos.x, (VIEW - h) / 2 + pos.y, w, h);
  }, [img, zoom, pos, base]);
  function down(e) { drag.current = { x: e.clientX, y: e.clientY, start: pos }; e.currentTarget.setPointerCapture(e.pointerId); }
  function move(e) { if (!drag.current) return; setPos(clamp({ x: drag.current.start.x + e.clientX - drag.current.x, y: drag.current.start.y + e.clientY - drag.current.y })); }
  function key(e) {
    const d = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
    if (d) { e.preventDefault(); setPos(p => clamp({ x: p.x + d[0], y: p.y + d[1] })); }
  }
  async function save() {
    setBusy(true);
    const out = document.createElement('canvas'); out.width = out.height = OUT;
    const ctx = out.getContext('2d'), k = OUT / VIEW;
    const w = img.width * base * zoom * k, h = img.height * base * zoom * k;
    ctx.drawImage(img, (OUT - w) / 2 + pos.x * k, (OUT - h) / 2 + pos.y * k, w, h);
    let data = out.toDataURL('image/webp', .86);
    if (!data.startsWith('data:image/webp')) data = out.toDataURL('image/jpeg', .86);
    await onSave(data); setBusy(false);
  }
  return (
    <WizardFrame icon={<Camera size={18} />} title="Profile photo" subtitle="Drag to frame your face, then zoom." steps={['Frame']} step={0} onClose={onCancel}
      footer={<><button type="button" className="btn quiet" onClick={onCancel}>Cancel</button><button type="button" className="btn" disabled={!img || busy} onClick={save}>{busy ? 'Saving…' : 'Save photo'}</button></>}>
      <div className="photo-edit">
        <div className="photo-stage" tabIndex={0} role="img" aria-label="Photo preview. Use arrow keys to move." onKeyDown={key}
          onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
          <canvas ref={canvas} style={{ width: VIEW, height: VIEW }} />
          <span className="photo-ring" aria-hidden="true" />
        </div>
        <label className="field" style={{ width: VIEW }}>Zoom
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => { const z = Number(e.target.value); setZoom(z); setPos(p => clamp(p, z)); }} /></label>
      </div>
    </WizardFrame>
  );
}

export function ProfileCard() {
  const ws = useWs();
  const u = ws.user;
  const [name, setName] = useState(u.full_name);
  const [file, setFile] = useState(null);
  const [sent, setSent] = useState(false);
  const input = useRef(null);
  const patch = p => ws.setUser?.(x => ({ ...x, ...p }));
  async function saveName(e) {
    e.preventDefault();
    try { const r = await ws.call('/v1/auth/me/profile', { method: 'PUT', body: { full_name: name } }); patch(r); ws.toast('Profile updated.'); } catch (err) { ws.onError(err); }
  }
  async function savePhoto(data) {
    try { const r = await ws.call('/v1/auth/me/avatar', { method: 'PUT', body: { image: data } }); patch(r); setFile(null); ws.toast('Photo updated.'); } catch (err) { ws.onError(err); }
  }
  async function removePhoto() {
    try { patch(await ws.call('/v1/auth/me/avatar', { method: 'DELETE' })); ws.toast('Photo removed.'); } catch (err) { ws.onError(err); }
  }
  async function resend() {
    try { const r = await ws.call('/v1/auth/verify-email/resend', { method: 'POST' }); setSent(true); ws.toast(r.sent ? 'Confirmation email sent.' : 'Email is not enabled on this server.'); } catch (err) { ws.onError(err); }
  }
  return (
    <div className="panel profile-card">
      <div className="profile-photo">
        <button type="button" className="photo-btn" onClick={() => input.current?.click()} aria-label="Change profile photo">
          <Avatar user={u} size={96} /><span className="photo-cam"><Camera size={16} /></span>
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 15e6) { ws.toast('Choose an image under 15 MB.', 'warn'); return; } setFile(f); }} />
        <div className="actions">
          <button type="button" className="btn ghost sm" onClick={() => input.current?.click()}><Upload size={14} /> {u.avatar ? 'Change' : 'Upload'}</button>
          {u.avatar && <button type="button" className="btn quiet sm" onClick={removePhoto}><Trash2 size={14} /> Remove</button>}
        </div>
      </div>
      <form className="form" onSubmit={saveName}>
        <h2 style={{ margin: 0 }}>Profile</h2>
        <label className="field">Full name<input value={name} onChange={e => setName(e.target.value)} required maxLength={160} autoComplete="name" /></label>
        <div className="field">Email
          <div className="email-row"><span>{u.email}</span>
            {u.email_verified ? <span className="gs-badge ok"><BadgeCheck size={12} /> Verified</span> : <span className="gs-badge warn"><MailWarning size={12} /> Not verified</span>}
            {!u.email_verified && u.email_verification_pending && <button type="button" className="linkish" disabled={sent} onClick={resend}>{sent ? 'Sent, check your inbox' : 'Send confirmation again'}</button>}
          </div></div>
        <div><button className="btn" disabled={name.trim() === u.full_name || !name.trim()}>Save profile</button></div>
      </form>
      <AnimatePresence>{file && <PhotoEditor key="photo" file={file} onCancel={() => setFile(null)} onSave={savePhoto} />}</AnimatePresence>
    </div>
  );
}

// ---- Two-step verification -------------------------------------------------
export function SecurityCard() {
  const ws = useWs();
  const [st, setSt] = useState(null);
  const [wizard, setWizard] = useState(false);
  const [manage, setManage] = useState('');
  const [form, setForm] = useState({ code: '', password: '' });
  const [codes, setCodes] = useState(null);
  const load = () => ws.call('/v1/auth/mfa/status').then(setSt).catch(ws.onError);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function disable(e) {
    e.preventDefault();
    try { await ws.call('/v1/auth/mfa/disable', { method: 'POST', body: { code: form.code, password: form.password || null } });
      ws.setUser?.(u => ({ ...u, mfa_enabled: false })); setManage(''); setForm({ code: '', password: '' }); ws.toast('Two-step verification turned off.', 'warn'); load(); } catch (err) { ws.onError(err); }
  }
  async function regenerate(e) {
    e.preventDefault();
    try { const r = await ws.call('/v1/auth/mfa/recovery-codes', { method: 'POST', body: { code: form.code } }); setCodes(r.recovery_codes); setForm({ code: '', password: '' }); load(); } catch (err) { ws.onError(err); }
  }
  if (!st) return null;
  return (
    <div className="panel form">
      <div className="panel-head"><div><h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><ShieldCheck size={17} /> Two-step verification</h3>
        <p>{st.enabled ? 'On. Every sign-in asks for a code from your authenticator app.' : 'Off. Add a code from your phone to every sign-in, so a stolen password is not enough.'}</p></div>
        <span className={`gs-badge ${st.enabled ? 'ok' : ''}`}>{st.enabled ? 'On' : 'Off'}</span></div>
      {!st.enabled && <div><button type="button" className="btn" onClick={() => setWizard(true)}><Smartphone size={15} /> Turn on</button></div>}
      {st.enabled && <>
        <p className="small muted" style={{ margin: 0 }}>{st.recovery_codes_left} recovery code{st.recovery_codes_left === 1 ? '' : 's'} left.</p>
        <div className="actions">
          <button type="button" className="btn ghost sm" onClick={() => { setManage(manage === 'codes' ? '' : 'codes'); setCodes(null); }}><KeyRound size={14} /> New recovery codes</button>
          <button type="button" className="btn quiet sm" onClick={() => setManage(manage === 'off' ? '' : 'off')}>Turn off</button>
        </div>
        {manage === 'codes' && !codes && <form className="form" onSubmit={regenerate}>
          <label className="field">Current code<input className="otp" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={20} /></label>
          <div><button className="btn sm">Create new codes</button></div></form>}
        {codes && <RecoveryCodes codes={codes} />}
        {manage === 'off' && <form className="form" onSubmit={disable}>
          <label className="field">Current code or a recovery code<input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required minLength={6} maxLength={20} autoComplete="one-time-code" /></label>
          <label className="field">Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="current-password" /></label>
          <div><button className="btn danger sm">Turn off two-step verification</button></div></form>}
      </>}
      <AnimatePresence>{wizard && <MfaWizard key="mfa" onClose={done => { setWizard(false); if (done) { ws.setUser?.(u => ({ ...u, mfa_enabled: true })); load(); } }} />}</AnimatePresence>
    </div>
  );
}

function RecoveryCodes({ codes }) {
  const ws = useWs();
  const text = `Galdus.ai recovery codes for ${ws.user.email}\nEach code works once.\n\n${codes.join('\n')}\n`;
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'galdus-recovery-codes.txt'; a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <div className="recovery">
      <ol>{codes.map(c => <li key={c}><code>{c}</code></li>)}</ol>
      <div className="actions">
        <button type="button" className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(text); ws.toast('Codes copied.'); }}><Copy size={14} /> Copy</button>
        <button type="button" className="btn ghost sm" onClick={download}><Download size={14} /> Download</button>
      </div>
    </div>
  );
}

function MfaWizard({ onClose }) {
  const ws = useWs();
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true); setError('');
    try { setSetup(await ws.call('/v1/auth/mfa/setup', { method: 'POST' })); setStep(1); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    try { const r = await ws.call('/v1/auth/mfa/enable', { method: 'POST', body: { code } }); setCodes(r.recovery_codes); setStep(3); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const footer = (
    <>
      {(step === 1 || step === 2) ? <button type="button" className="btn quiet" onClick={() => { setStep(s => s - 1); setError(''); }}><ArrowLeft size={15} /> Back</button> : <span />}
      {step === 0 && <button type="button" className="btn" disabled={busy} onClick={start}>Start <ArrowRight size={15} /></button>}
      {step === 1 && <button type="button" className="btn" onClick={() => setStep(2)}>I scanned it <ArrowRight size={15} /></button>}
      {step === 2 && <button type="button" className="btn" disabled={busy || code.length !== 6} onClick={confirm}>{busy ? 'Checking…' : 'Confirm'}</button>}
      {step === 3 && <button type="button" className="btn" disabled={!saved} onClick={() => setStep(4)}>Continue <ArrowRight size={15} /></button>}
      {step === 4 && <button type="button" className="btn" onClick={() => onClose(true)}>Done</button>}
    </>);
  return (
    <WizardFrame icon={<ShieldCheck size={18} />} title="Turn on two-step verification" subtitle="A code from your phone, on top of your password."
      steps={['Prepare', 'Scan', 'Confirm', 'Save codes', 'Ready']} step={step} onClose={() => onClose(step >= 3)} footer={footer}>
      {step === 0 && <div className="wz-form">
        <HowTo steps={[
          'Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden or Authy.',
          'Scan a QR code with it. The app then shows a new 6-digit code every 30 seconds.',
          'From then on, Galdus asks for that code after your password, also when you sign in with Google or GitHub.',
        ]} />
        <p className="wz-note"><KeyRound size={15} />You also get 10 recovery codes, for when your phone is not at hand.</p>
        {error && <div className="wz-error"><b>Could not start</b><span>{error}</span></div>}
      </div>}
      {step === 1 && setup && <div className="mfa-scan">
        <motion.div className="qr" initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} dangerouslySetInnerHTML={{ __html: setup.qr_svg }} />
        <div className="wz-text">
          <h3>Scan this code</h3>
          <p className="muted small" style={{ margin: 0 }}>In the app choose Add account, then Scan a QR code. Can't scan? Enter this key instead:</p>
          <code className="mfa-key">{setup.secret.match(/.{1,4}/g).join(' ')}</code>
          <button type="button" className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(setup.secret); ws.toast('Key copied.'); }}><Copy size={14} /> Copy key</button>
        </div>
      </div>}
      {step === 2 && <div className="wz-form" style={{ justifyItems: 'center', textAlign: 'center' }}>
        <h3 style={{ margin: 0 }}>Enter the code your app shows</h3>
        <input className="otp big" value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} inputMode="numeric"
          autoComplete="one-time-code" autoFocus placeholder="••••••" aria-label="6-digit code" onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) confirm(); }} />
        {error && <div className="wz-error" style={{ textAlign: 'left' }}><b>Not accepted</b><span>{error}</span></div>}
      </div>}
      {step === 3 && codes && <div className="wz-form">
        <h3 style={{ margin: 0 }}>Save your recovery codes</h3>
        <p className="muted small" style={{ margin: 0 }}>Keep them in your password manager or print them. Each one signs you in once if you lose your phone. They are shown only now.</p>
        <RecoveryCodes codes={codes} />
        <label className="check"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /><span>I saved my recovery codes</span></label>
      </div>}
      {step === 4 && <Done title="Two-step verification is on"><p className="muted">Next time you sign in, Galdus asks for a code from your app.</p></Done>}
    </WizardFrame>
  );
}
