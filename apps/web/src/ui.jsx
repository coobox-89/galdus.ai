import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Markdown from 'react-markdown';

// ---- Toasts -----------------------------------------------------------------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems(list => [...list.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems(list => list.filter(t => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map(t => (
            <motion.div key={t.id} className={`toast ${t.kind}`} layout
              initial={{ opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
              <span className="px" /><span>{t.message}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setItems(l => l.filter(x => x.id !== t.id))}>×</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

// ---- Pixel loader: the brand pixel assembling a 3x3 grid -----------------------
export function Pixels({ label = 'Working' }) {
  return (
    <span className="pixels" role="img" aria-label={label}>
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.i key={i} initial={{ opacity: .15 }} animate={{ opacity: [0.15, 1, 0.15] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: ((i % 3) + Math.floor(i / 3)) * 0.12 }} />
      ))}
    </span>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Status({ status }) {
  const map = { succeeded: ['ok', 'Succeeded'], failed: ['bad', 'Failed'], running: ['warn', 'Running'], disabled: ['bad', 'Disabled'] };
  const [kind, label] = map[status] || ['', status || 'Not run yet'];
  return <span className={`chip ${kind}`}><span className="px" />{label}</span>;
}

export function Md({ children }) {
  return <div className="md"><Markdown>{children || ''}</Markdown></div>;
}

export function PageHead({ title, children, actions }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{children && <p>{children}</p>}</div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export const when = iso => (iso ? new Date(iso).toLocaleString() : 'never');
export const fmt = n => new Intl.NumberFormat().format(n ?? 0);

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
