// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, Search } from 'lucide-react';

// Branded dropdowns that replace the browser's native <select> and <datalist>.
// Options: { value, label, hint?, icon?, group?, badge?, disabled?, tone? }

function usePopover(open, anchorRef) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom, above = r.top;
      const up = below < 260 && above > below;
      setPos({ left: r.left, width: Math.max(r.width, 220), top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined,
        maxHeight: Math.min(360, (up ? above : below) - 16), up });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchorRef]);
  return pos;
}

function useOutside(open, refs, close) {
  useEffect(() => {
    if (!open) return undefined;
    const on = e => { if (!refs.some(r => r.current?.contains(e.target))) close(); };
    document.addEventListener('pointerdown', on);
    return () => document.removeEventListener('pointerdown', on);
  }, [open, refs, close]);
}

function Menu({ id, pos, options, active, selected, onPick, onHover, listRef, labelledBy, empty }) {
  const reduce = useReducedMotion();
  let lastGroup;
  return createPortal(
    <motion.ul id={id} ref={listRef} role="listbox" aria-labelledby={labelledBy} className="gs-menu"
      style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
      initial={reduce ? false : { opacity: 0, y: pos.up ? 6 : -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? undefined : { opacity: 0, y: pos.up ? 4 : -4, scale: .98, transition: { duration: .12 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}>
      {options.length === 0 && <li className="gs-empty">{empty || 'No options'}</li>}
      {options.map((o, i) => {
        const header = o.group && o.group !== lastGroup ? (lastGroup = o.group, <li key={`g-${o.group}`} className="gs-group" role="presentation">{o.group}</li>) : null;
        return (
          <React.Fragment key={`${o.value}-${i}`}>
            {header}
            <li id={`${id}-${i}`} role="option" aria-selected={o.value === selected} aria-disabled={o.disabled || undefined}
              className={`gs-opt ${i === active ? 'active' : ''} ${o.value === selected ? 'selected' : ''} ${o.tone || ''}`}
              onPointerEnter={() => onHover(i)} onPointerDown={e => e.preventDefault()} onClick={() => !o.disabled && onPick(o)}>
              {o.icon && <span className="gs-ic">{o.icon}</span>}
              <span className="gs-txt"><span>{o.label}</span>{o.hint && <small>{o.hint}</small>}</span>
              {o.badge && <span className={`gs-badge ${o.badgeTone || ''}`}>{o.badge}</span>}
              {o.value === selected && <Check size={15} className="gs-check" />}
            </li>
          </React.Fragment>);
      })}
    </motion.ul>, document.body);
}

export function Select({ value, onChange, options, placeholder = 'Choose…', disabled, id: idProp, className = '', compact, searchable, 'aria-label': ariaLabel }) {
  const autoId = useId();
  const id = idProp || `gs${autoId.replace(/:/g, '')}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const btn = useRef(null), list = useRef(null), typed = useRef({ text: '', t: 0 });
  const pos = usePopover(open, btn);
  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  useOutside(open, [btn, list], close);
  const current = options.find(o => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => `${o.label} ${o.hint || ''} ${o.group || ''}`.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const useSearch = searchable ?? options.length > 9;

  useEffect(() => { if (open) setActive(Math.max(0, shown.findIndex(o => o.value === value))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector('.gs-opt.active')?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  const pick = o => { onChange(o.value, o); close(); btn.current?.focus(); };
  const move = d => setActive(a => {
    let n = a;
    for (let k = 0; k < shown.length; k += 1) { n = (n + d + shown.length) % shown.length; if (!shown[n].disabled) break; }
    return n;
  });
  function onKey(e) {
    if (disabled) return;
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active] && !shown[active].disabled) pick(shown[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { close(); }
    else if (!useSearch && e.key.length === 1) {
      const now = Date.now(); typed.current = { text: (now - typed.current.t < 600 ? typed.current.text : '') + e.key.toLowerCase(), t: now };
      const i = shown.findIndex(o => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <div className={`gs ${compact ? 'compact' : ''} ${className}`}>
      <button ref={btn} type="button" id={id} className={`gs-btn ${open ? 'open' : ''}`} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={ariaLabel}
        aria-activedescendant={open ? `${id}-list-${active}` : undefined}
        onClick={() => (open ? close() : setOpen(true))} onKeyDown={onKey}>
        {current?.icon && <span className="gs-ic">{current.icon}</span>}
        <span className={`gs-val ${current ? '' : 'ph'}`}>{current ? current.label : placeholder}</span>
        {current?.badge && <span className={`gs-badge ${current.badgeTone || ''}`}>{current.badge}</span>}
        <ChevronDown size={16} className="gs-chev" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && pos && (
          <>
            {useSearch && createPortal(
              <div className="gs-search" style={{ left: pos.left, width: pos.width, top: pos.up ? undefined : pos.top, bottom: pos.up ? pos.bottom : undefined }}>
                <Search size={14} /><input autoFocus value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
                  placeholder="Search" aria-label="Search options" onPointerDown={e => e.stopPropagation()} />
              </div>, document.body)}
            <Menu id={`${id}-list`} pos={useSearch ? { ...pos, top: pos.up ? pos.top : pos.top + 44, bottom: pos.up ? pos.bottom + 44 : undefined, maxHeight: pos.maxHeight - 44 } : pos}
              options={shown} active={active} selected={value} onPick={pick} onHover={setActive} listRef={list} labelledBy={id} />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Free text with branded suggestions (replaces <input list> + <datalist>).
export function Combo({ value, onChange, suggestions = [], placeholder, maxLength = 200, required, onBlur, 'aria-label': ariaLabel, id: idProp }) {
  const autoId = useId();
  const id = idProp || `gc${autoId.replace(/:/g, '')}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef(null), list = useRef(null);
  const pos = usePopover(open, wrap);
  const close = useCallback(() => setOpen(false), []);
  useOutside(open, [wrap, list], close);
  const q = (value || '').toLowerCase();
  const shown = suggestions.filter(s => !q || s.toLowerCase().includes(q) || suggestions.includes(value)).map(s => ({ value: s, label: s }));
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); onChange(shown[active].value); close(); }
    else if (e.key === 'Escape') close();
  }
  return (
    <div className="gs" ref={wrap}>
      <div className={`gs-combo ${open ? 'open' : ''}`}>
        <input id={id} value={value} onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)}
          onKeyDown={onKey} onBlur={onBlur} placeholder={placeholder} maxLength={maxLength} required={required} autoComplete="off"
          role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-label={ariaLabel} />
        {suggestions.length > 0 && <button type="button" tabIndex={-1} className="gs-combo-btn" aria-label="Show suggestions"
          onClick={() => setOpen(o => !o)}><ChevronDown size={16} /></button>}
      </div>
      <AnimatePresence>
        {open && pos && shown.length > 0 && (
          <Menu id={`${id}-list`} pos={pos} options={shown} active={active} selected={value} listRef={list} labelledBy={id}
            onHover={setActive} onPick={o => { onChange(o.value); close(); }} />)}
      </AnimatePresence>
    </div>
  );
}
