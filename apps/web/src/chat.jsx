import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Check, Copy, FileText, Image as ImageIcon, Paperclip, Pin, Plus, RotateCcw, Search, Send, Square, Trash2, X } from 'lucide-react';
import { API_BASE_URL } from './config';
import { useWs } from './workspace';
import { Md, Pixels } from './ui';
import { Select } from './select';
import { ModelPicker } from './modelpicker';
import { Avatar } from './profile';

const STARTERS = {
  assistant: ['Summarise a text I paste', 'Plan my week with priorities', 'Explain a concept simply'],
  analyst: ['Compare two offers in a table', 'Build a simple business case', 'Find the risks in this plan'],
  writer: ['Draft a polite follow-up email', 'Make this paragraph clearer', 'Write a LinkedIn post'],
  it_expert: ['Troubleshoot a slow VM', 'Write a runbook for a restore', 'Review this firewall rule'],
  coder: ['Explain this error', 'Write a Python script that…', 'Review my SQL query'],
  tutor: ['Teach me ITIL incident management', 'Quiz me on networking', 'Explain RAG step by step'],
};

async function* readSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, i); buffer = buffer.slice(i + 2);
      const line = chunk.split('\n').find(l => l.startsWith('data: '));
      if (line) yield JSON.parse(line.slice(6));
    }
  }
}

export function ChatPage({ go }) {
  const ws = useWs();
  const [convs, setConvs] = useState([]);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [settings, setSettings] = useState({ persona: 'assistant', connection_id: '', model: '', collection_id: '' });
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState('');
  const abort = useRef(null);
  const endRef = useRef(null);
  const fileInput = useRef(null);
  const { connections } = ws.sources;

  const loadConvs = useCallback(() => ws.call('/v1/conversations').then(setConvs).catch(ws.onError), [ws]);
  useEffect(() => { loadConvs(); ws.call('/v1/chat/personas').then(setPersonas).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!settings.connection_id && !settings.model && connections[0]) setSettings(s => ({ ...s, connection_id: connections[0].id, model: connections[0].default_model || '' }));
  }, [connections]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  async function open(c) {
    try {
      const full = await ws.call(`/v1/conversations/${c.id}`);
      setActive(full); setMessages(full.messages);
      setSettings({ persona: full.persona, connection_id: full.connection_id || '', model: full.model, collection_id: full.collection_id || '' });
    } catch (err) { ws.onError(err); }
  }
  function fresh() { setActive(null); setMessages([]); setFiles([]); }

  async function persist(next) {
    const body = { persona: next.persona, connection_id: next.connection_id || null, model: next.model, collection_id: next.collection_id || null,
      title: active?.title, pinned: active?.pinned || false };
    if (active) { const c = await ws.call(`/v1/conversations/${active.id}`, { method: 'PUT', body }); setActive(a => ({ ...a, ...c })); }
  }
  function change(patch) { const next = { ...settings, ...patch }; setSettings(next); persist(next).catch(ws.onError); }

  async function addFiles(list) {
    for (const file of Array.from(list || []).slice(0, 5 - files.length)) {
      const data = new FormData(); data.append('file', file);
      try {
        const res = await fetch(`${API_BASE_URL}/v1/chat/attachments`, { method: 'POST', body: data,
          headers: { Authorization: `Bearer ${ws.token}`, 'X-Organization-Id': ws.organizationId } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(body.detail || 'The attachment could not be read.'), { status: res.status });
        setFiles(f => [...f, body]);
        if (body.truncated) ws.toast(`${file.name} is long: only the first part is used.`, 'warn');
      } catch (err) { ws.onError(err); }
    }
  }

  async function send(text, { regenerate = false } = {}) {
    const content = (text ?? prompt).trim();
    if (!content || streaming) return;
    if (!settings.model) { ws.toast('Choose a model first.', 'warn'); return; }
    let conv = active;
    try {
      if (!conv) {
        conv = await ws.call('/v1/conversations', { method: 'POST', body: { persona: settings.persona, connection_id: settings.connection_id || null,
          model: settings.model, collection_id: settings.collection_id || null } });
        setActive(conv);
      }
      if (regenerate) await ws.call(`/v1/conversations/${conv.id}/messages/last`, { method: 'DELETE' });
    } catch (err) { ws.onError(err); return; }
    const attachments = files;
    const base = regenerate ? messages.slice(0, -2) : messages;
    const pending = { id: `a-${Date.now()}`, role: 'assistant', content: '', streaming: true, sources: [] };
    setMessages([...base, { id: `u-${Date.now()}`, role: 'user', content, attachments: attachments.map(a => ({ name: a.name, kind: a.kind })) }, pending]);
    setPrompt(''); setFiles([]); setStreaming(true);
    const controller = new AbortController(); abort.current = controller;
    const update = patch => setMessages(list => list.map(m => (m.id === pending.id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));
    try {
      const res = await fetch(`${API_BASE_URL}/v1/conversations/${conv.id}/messages`, { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ws.token}`, 'X-Organization-Id': ws.organizationId },
        body: JSON.stringify({ content, attachments }) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw Object.assign(new Error(b.detail || 'The message could not be sent.'), { status: res.status }); }
      for await (const ev of readSSE(res)) {
        if (ev.type === 'meta') { update({ model: ev.model, sources: ev.sources }); setActive(a => ({ ...a, title: ev.title })); }
        if (ev.type === 'delta') update(m => ({ content: m.content + ev.text }));
        if (ev.type === 'error') { ws.toast(ev.message, 'error'); update(m => ({ error: true, content: m.content || '' })); }
        if (ev.type === 'done') update({ streaming: false, tokens: ev.tokens });
      }
    } catch (err) {
      if (err.name !== 'AbortError') ws.onError(err);
    } finally {
      update({ streaming: false }); setStreaming(false); loadConvs();
    }
  }

  async function remove(c, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    try { await ws.call(`/v1/conversations/${c.id}`, { method: 'DELETE' }); if (active?.id === c.id) fresh(); loadConvs(); } catch (err) { ws.onError(err); }
  }
  async function pin(c, e) {
    e.stopPropagation();
    try { await ws.call(`/v1/conversations/${c.id}`, { method: 'PUT', body: { ...c, pinned: !c.pinned } }); loadConvs(); } catch (err) { ws.onError(err); }
  }
  function copy(m) { navigator.clipboard?.writeText(m.content); setCopied(m.id); setTimeout(() => setCopied(''), 1500); }

  const persona = personas.find(p => p.id === settings.persona);
  const shown = convs.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()));
  const last = messages[messages.length - 1];

  if (ws.sources.loaded && !connections.length && !ws.sources.platform.length) return (
    <div className="empty" style={{ marginTop: 40 }}><h3>Connect a model to start chatting</h3>
      <p>Galdus works with any provider. Add your API key once and every page can use it.</p>
      <button type="button" className="btn" onClick={async () => { const r = await ws.connectModel(); if (r) setSettings(st => ({ ...st, connection_id: r.connectionId, model: r.model })); }}>Connect a model</button></div>);

  return (
    <div className="chat2">
      <h1 className="sr-only">Chat</h1>
      <aside className="convs" aria-label="Conversations">
        <button type="button" className="btn block" onClick={fresh}><Plus size={16} /> New chat</button>
        <label className="field" style={{ position: 'relative' }}><span className="sr-only">Search chats</span>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--faint)' }} />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search chats" style={{ paddingLeft: 32, fontSize: 13 }} /></label>
        <motion.div className="list" layout>
          <AnimatePresence initial={false}>
            {shown.map(c => (
              <motion.button layout key={c.id} type="button" className={`conv ${active?.id === c.id ? 'active' : ''}`} onClick={() => open(c)}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}>
                <span>{c.pinned && <Pin size={11} style={{ marginRight: 6, color: 'var(--lime)' }} />}{c.title}</span>
                <span className="acts">
                  <button type="button" aria-label={c.pinned ? 'Unpin' : 'Pin'} onClick={e => pin(c, e)}><Pin size={13} /></button>
                  <button type="button" aria-label="Delete" onClick={e => remove(c, e)}><Trash2 size={13} /></button>
                </span>
              </motion.button>))}
          </AnimatePresence>
          {shown.length === 0 && <p className="small muted" style={{ padding: '4px 10px' }}>{convs.length ? 'No matches.' : 'Your chats will appear here.'}</p>}
        </motion.div>
      </aside>

      <section className="chat-main">
        <div className="chat-bar">
          <label className="field">Assistant
            <Select value={settings.persona} onChange={v => change({ persona: v })} compact
              options={personas.map(p => ({ value: p.id, label: p.name, hint: p.description.split('. ')[0] }))} /></label>
          <ModelPicker compact value={{ connectionId: settings.connection_id || '', model: settings.model }}
            onChange={v => change({ connection_id: v.connectionId, model: v.model })} />
          <label className="field">Knowledge
            <Select value={settings.collection_id || ''} onChange={v => change({ collection_id: v })} compact
              options={[{ value: '', label: 'Off', hint: 'Answer from the model only' }, ...ws.collections.map(c => ({ value: c.id, label: c.name, hint: `${c.documents} document${c.documents === 1 ? '' : 's'}` }))]} /></label>
        </div>

        <div className="thread" aria-live="polite">
          {messages.length === 0 && (
            <motion.div className="chat-empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="grad-text" style={{ fontSize: 'var(--step-3)' }}>How can I help, {ws.user.full_name.split(' ')[0]}?</h2>
              <p className="muted" style={{ margin: 0 }}>{persona ? persona.description : ''}</p>
              <div className="persona-grid">{personas.map(p => (
                <button key={p.id} type="button" className={`persona ${settings.persona === p.id ? 'active' : ''}`} onClick={() => change({ persona: p.id })}>
                  <b>{p.name}</b><small>{p.description.split('. ')[0]}.</small></button>))}</div>
              <div className="suggestions">{(STARTERS[settings.persona] || STARTERS.assistant).map(s => (
                <button key={s} type="button" className="suggestion" onClick={() => setPrompt(s)}>{s}</button>))}</div>
            </motion.div>)}
          <AnimatePresence initial={false}>
            {messages.map(m => (
              <motion.div key={m.id} className={`msg ${m.role}`} layout="position"
                initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
                <span className="who">{m.role === 'user' ? <><Avatar user={ws.user} size={18} /> You</> : (m.model || settings.model)}{m.tokens ? <span className="muted" style={{ fontWeight: 500 }}> · {m.tokens} tokens</span> : null}</span>
                {m.attachments?.length > 0 && <div className="attach-chips" style={{ padding: 0, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.attachments.map(a => <span key={a.name} className="attach">{a.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}{a.name}</span>)}</div>}
                {m.role === 'user' ? <div className="body">{m.content}</div> : (
                  <div className="body">
                    {m.streaming && !m.content ? <Pixels label="Thinking" /> : <><Md>{m.content}</Md>{m.streaming && <span className="caret" />}</>}
                  </div>)}
                {m.role === 'assistant' && m.sources?.length > 0 && !m.streaming && (
                  <div className="src-chips">{m.sources.map((s, i) => <span key={i} className="chip ok" title={s.excerpt}><BookOpen size={11} /> [{i + 1}] {s.title}</span>)}</div>)}
                {m.role === 'assistant' && !m.streaming && m.content && (
                  <div className="tools">
                    <button type="button" className="btn quiet sm icon" aria-label="Copy" onClick={() => copy(m)}>{copied === m.id ? <Check size={14} /> : <Copy size={14} />}</button>
                    {m === last && <button type="button" className="btn quiet sm icon" aria-label="Regenerate" onClick={() => send(messages[messages.length - 2]?.content, { regenerate: true })}><RotateCcw size={14} /></button>}
                  </div>)}
              </motion.div>))}
          </AnimatePresence>
          <div ref={endRef} />
        </div>

        <form className={`composer2 gborder ${drag ? 'drag' : ''}`} onSubmit={e => { e.preventDefault(); send(); }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
          <AnimatePresence>{files.length > 0 && (
            <motion.div className="attach-chips" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              {files.map((f, i) => <motion.span key={f.name + i} className="attach" initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                {f.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}{f.name}
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(list => list.filter((_, j) => j !== i))}><X size={12} /></button></motion.span>)}
            </motion.div>)}</AnimatePresence>
          <label className="sr-only" htmlFor="prompt">Message</label>
          <textarea id="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={`Message ${persona?.name || 'Galdus'}…`} maxLength={100000}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }} />
          <div className="row2">
            <div className="actions">
              <input ref={fileInput} type="file" multiple className="sr-only" accept=".pdf,.txt,.md,.csv,.json,.html,.log,.png,.jpg,.jpeg,.webp,.gif"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
              <button type="button" className="btn quiet sm" onClick={() => fileInput.current?.click()} disabled={files.length >= 5}><Paperclip size={15} /> Attach</button>
              <span className="composer-hint">Drop or paste files and images. Enter to send.</span>
            </div>
            {streaming
              ? <button type="button" className="btn ghost sm" onClick={() => abort.current?.abort()}><Square size={13} /> Stop</button>
              : <button className="btn sm" disabled={!prompt.trim() || !settings.model}><Send size={14} /> Send</button>}
          </div>
        </form>
      </section>
    </div>
  );
}
