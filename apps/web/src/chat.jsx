import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ModelPicker } from './modelpicker';
import { useWs } from './workspace';
import { Md, Pixels } from './ui';

const STARTERS = ['Summarize the key points of a text I paste', 'Draft a polite follow-up email', 'Explain a concept in simple terms', 'Help me plan my week'];

export function ChatPage({ go }) {
  const ws = useWs();
  const [selection, setSelection] = useState({ connectionId: '', model: '' });
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const pick = useCallback(v => setSelection(v), []);
  const hasModels = ws.sources.connections.length || ws.sources.platform.length;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages, busy]);

  async function send(text) {
    const content = (text ?? prompt).trim();
    if (!content || busy || !selection.model) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next); setPrompt(''); setBusy(true);
    try {
      const data = await ws.call('/v1/chat/completions', { method: 'POST', body: {
        connection_id: selection.connectionId || undefined, model: selection.model, messages: next.map(({ role, content: c }) => ({ role, content: c })) } });
      setMessages([...next, { role: 'assistant', content: data.content, model: data.model }]);
    } catch (err) { setMessages(messages); setPrompt(content); ws.onError(err); } finally { setBusy(false); }
  }

  return (
    <div className="chat">
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 260 }}><ModelPicker value={selection} onChange={pick} go={go} /></div>
        {messages.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setMessages([])}>New chat</button>}
      </div>
      <div className="thread" aria-live="polite">
        {messages.length === 0 && !busy && hasModels ? (
          <div className="chat-empty">
            <h2>What can I help with?</h2>
            <p className="muted" style={{ margin: 0 }}>Your messages go to {selection.model || 'the selected model'} through your own key.</p>
            <div className="suggestions">{STARTERS.map(s => <button key={s} type="button" className="suggestion" onClick={() => setPrompt(s)}>{s}</button>)}</div>
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div key={i} className={`msg ${m.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>
              <span className="who">{m.role === 'user' ? 'You' : m.model}</span>
              {m.role === 'user' ? <div className="body">{m.content}</div> : <div className="body"><Md>{m.content}</Md></div>}
            </motion.div>
          ))}
          {busy && (
            <motion.div key="busy" className="msg assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="who">{selection.model}</span><div className="body"><Pixels label="Thinking" /></div>
            </motion.div>)}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="prompt">Message</label>
        <textarea id="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Message Galdus…" maxLength={100000}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn" disabled={busy || !prompt.trim() || !selection.model}>Send</button>
      </form>
      <span className="composer-hint">Enter to send, Shift + Enter for a new line.</span>
    </div>
  );
}
