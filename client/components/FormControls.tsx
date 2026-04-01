/**
 * Shared form controls — Toggle, Section, Row, NumInput, TextArea.
 * Generic across all apps. Uses CSS custom properties only.
 */
import { useState, useEffect, type ReactNode } from 'react';
import './FormControls.css';

// ── Inline SVG Icons (no external dependency) ────────────────────────────

function IconRefresh({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function IconLoader({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function IconCheckmark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── iOS Toggle Switch ────────────────────────────────────────────────────

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  const cls = [
    'fc-toggle',
    checked && 'fc-toggle--checked',
    disabled && 'fc-toggle--disabled',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cls}
    >
      <span className="fc-toggle__knob" />
    </button>
  );
}

// ── Section Card ─────────────────────────────────────────────────────────

export interface SectionProps {
  title: string;
  icon?: React.ComponentType<{ size: number; className?: string }>;
  children: ReactNode;
}

export function Section({ title, icon: Icon, children }: SectionProps) {
  return (
    <div className="fc-section">
      <div className="fc-section__header">
        {Icon && <Icon size={14} className="fc-section__icon" />}
        {title}
      </div>
      <div className="fc-section__body">
        {children}
      </div>
    </div>
  );
}

// ── Setting Row ──────────────────────────────────────────────────────────

export interface RowProps {
  label: string;
  hint?: string;
  modified?: boolean;
  onReset?: () => void;
  isLast?: boolean;
  children: ReactNode;
}

export function Row({ label, hint, modified, onReset, isLast, children }: RowProps) {
  const rowCls = ['fc-row', isLast && 'fc-row--last'].filter(Boolean).join(' ');

  return (
    <div className={rowCls}>
      <div className="fc-row__label-area">
        <div className="fc-row__label-line">
          <span className="fc-row__label">{label}</span>
          {modified && onReset && (
            <button onClick={onReset} className="fc-row__reset" title="Reset to default">
              <IconRefresh size={10} />
            </button>
          )}
        </div>
        {hint && <span className="fc-row__hint">{hint}</span>}
      </div>
      <div className="fc-row__control">
        {children}
      </div>
    </div>
  );
}

// ── Number Input ─────────────────────────────────────────────────────────

export interface NumInputProps {
  value: string | number;
  onSave: (v: string) => Promise<void>;
  min?: number;
  max?: number;
  step?: number;
}

export function NumInput({ value, onSave, min, max, step }: NumInputProps) {
  const [local, setLocal] = useState(String(value ?? ''));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(String(value ?? '')); setDirty(false); }, [value]);

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try { await onSave(local); setDirty(false); } finally { setSaving(false); }
  };

  const inputCls = ['fc-numinput__input', dirty && 'fc-numinput__input--dirty'].filter(Boolean).join(' ');

  return (
    <div className="fc-numinput">
      {saving && <IconLoader size={14} className="animate-spin fc-numinput__spinner" />}
      <input
        type="number" value={local}
        onChange={e => { setLocal(e.target.value); setDirty(e.target.value !== String(value)); }}
        onBlur={save} onKeyDown={e => e.key === 'Enter' && save()}
        step={step} min={min} max={max}
        className={inputCls}
      />
    </div>
  );
}

// ── Textarea Input ───────────────────────────────────────────────────────

export interface TextAreaProps {
  value: string;
  onSave: (v: string) => Promise<void>;
  placeholder?: string;
  rows?: number;
}

export function TextArea({ value, onSave, placeholder, rows = 3 }: TextAreaProps) {
  const [local, setLocal] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(value || ''); }, [value]);

  const dirty = local !== (value || '');

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const textareaCls = ['fc-textarea__input', dirty && 'fc-textarea__input--dirty'].filter(Boolean).join(' ');
  const btnCls = ['fc-textarea__save-btn', dirty && 'fc-textarea__save-btn--active'].filter(Boolean).join(' ');

  return (
    <div className="fc-textarea">
      <textarea
        value={local}
        onChange={e => { setLocal(e.target.value); setSaved(false); }}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } }}
        rows={rows} placeholder={placeholder}
        className={textareaCls}
      />
      <div className="fc-textarea__footer">
        {saved && (
          <span className="fc-textarea__saved">
            <IconCheckmark size={12} /> Saved
          </span>
        )}
        <button onClick={save} disabled={!dirty || saving} className={btnCls}>
          {saving ? <IconLoader size={12} className="animate-spin" /> : null}
          {saving ? 'Saving' : 'Save'}
        </button>
      </div>
    </div>
  );
}
