'use client';

import { useId } from 'react';

interface BaseProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

function Wrapper({
  label,
  error,
  hint,
  required,
  id,
  children,
}: BaseProps & { id: string; children: (ids: { describedBy?: string }) => React.ReactNode }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
        {label}
        {required && (
          <span className="ml-1 text-apex" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({ describedBy: describedBy || undefined })}

      {hint && !error && (
        <p id={hintId} className="text-[12px] leading-snug text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[12px] leading-snug text-apex" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────

interface SelectProps extends BaseProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  disabled?: boolean;
}

export function SelectField({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  ...base
}: SelectProps) {
  const id = useId();
  return (
    <Wrapper {...base} id={id}>
      {({ describedBy }) => (
        <select
          id={id}
          className="input-field"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={base.error ? true : undefined}
          aria-required={base.required}
        >
          {/* Not `disabled` — a disabled option is unreachable by keyboard and
              reads as a broken control. It's simply the empty value, which the
              validator rejects with a real message. */}
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Wrapper>
  );
}

// ── Text input ───────────────────────────────────────────────────────────────

interface InputProps extends BaseProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'date';
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  maxLength?: number;
  autoComplete?: string;
  min?: string;
  disabled?: boolean;
}

export function InputField({
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  maxLength,
  autoComplete,
  min,
  disabled,
  ...base
}: InputProps) {
  const id = useId();
  return (
    <Wrapper {...base} id={id}>
      {({ describedBy }) => (
        <input
          id={id}
          className="input-field"
          type={type}
          value={value}
          min={min}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={base.error ? true : undefined}
          aria-required={base.required}
        />
      )}
    </Wrapper>
  );
}

// ── Textarea ─────────────────────────────────────────────────────────────────

export function TextAreaField({
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
  ...base
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Wrapper {...base} id={id}>
      {({ describedBy }) => (
        <textarea
          id={id}
          className="input-field resize-y"
          rows={rows}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={base.error ? true : undefined}
        />
      )}
    </Wrapper>
  );
}

// ── Selectable card (used for services / sizes / add-ons) ────────────────────

export function ChoiceCard({
  selected,
  onToggle,
  title,
  subtitle,
  meta,
  multi = true,
}: {
  selected: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  meta?: string;
  /** Checkbox semantics for multi-select, radio for single-select. */
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onClick={onToggle}
      className={`flex items-start justify-between gap-3 rounded-sm border px-4 py-3.5 text-left transition-all duration-200 ${
        selected ? 'border-apex bg-apex/10' : 'border-white/20 hover:border-white/45'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-white">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[12px] leading-snug text-subtle">{subtitle}</span>}
        {meta && <span className="mt-1 block font-mono text-[11px] text-muted">{meta}</span>}
      </span>

      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center border ${
          multi ? 'rounded-[3px]' : 'rounded-full'
        } ${selected ? 'border-apex bg-apex' : 'border-white/35'}`}
      >
        {selected && (
          <svg width="10" height="8" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.2 5.8L8 1" stroke="white" strokeWidth="1.6" />
          </svg>
        )}
      </span>
    </button>
  );
}
