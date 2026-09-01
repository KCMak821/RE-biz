"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";

/* ------------------------------------------------------------------ wrappers */

export function FormSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  title: string;
}) {
  return (
    <fieldset className="fsection">
      <legend className="fsection-title">{title}</legend>
      {description ? <p className="fsection-desc">{description}</p> : null}
      {children}
    </fieldset>
  );
}

export function FormGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return <div className={`fgrid fgrid-${columns}`}>{children}</div>;
}

export function FormActions({ children, sticky }: { children: ReactNode; sticky?: boolean }) {
  return <div className={sticky ? "factions factions-sticky" : "factions"}>{children}</div>;
}

/** Form-level problem, shown right above the submit button where the eye already is. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="form-error" role="alert">
      {children}
    </p>
  );
}

export function FormNote({ children }: { children: ReactNode }) {
  return <p className="form-note">{children}</p>;
}

/**
 * Progressive disclosure. Everything a first-time user needs stays visible;
 * the rest waits behind one click so the first screen is not a wall of inputs.
 */
export function Disclosure({
  children,
  defaultOpen,
  label,
  summary,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  label: string;
  summary?: string;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const id = useId();
  return (
    <div className={open ? "disclosure is-open" : "disclosure"}>
      <button
        aria-controls={id}
        aria-expanded={open}
        className="disclosure-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ChevronDown aria-hidden="true" size={15} />
        <span>{label}</span>
        {summary && !open ? <em>{summary}</em> : null}
      </button>
      <div className="disclosure-body" hidden={!open} id={id}>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- fields */

type BaseFieldProps = {
  error?: string;
  hint?: ReactNode;
  label: string;
  /** Marks the field 必填 and wires aria-required. */
  required?: boolean;
  span?: boolean;
};

function FieldFrame({
  children,
  error,
  hint,
  hintId,
  errorId,
  label,
  labelFor,
  required,
  span,
  trailing,
}: BaseFieldProps & {
  children: ReactNode;
  errorId: string;
  hintId: string;
  labelFor: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={span ? "field field-span" : "field"}>
      {/* The marker sits beside the <label>, not inside it, so the label's text is
          exactly the field name. `aria-required` already carries the requirement. */}
      <div className="field-label-row">
        <label className="field-label" htmlFor={labelFor}>
          {label}
        </label>
        {required ? (
          <b aria-hidden="true" className="field-req">
            必填
          </b>
        ) : (
          <em aria-hidden="true" className="field-optional">
            選填
          </em>
        )}
      </div>
      {children}
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {trailing}
    </div>
  );
}

export function Field({
  className = "",
  error,
  hint,
  label,
  required,
  span,
  ...props
}: BaseFieldProps & Omit<ComponentProps<"input">, "id">) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <FieldFrame
      error={error}
      errorId={errorId}
      hint={hint}
      hintId={hintId}
      label={label}
      labelFor={id}
      required={required}
      span={span}
    >
      <input
        {...props}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        className={`control ${className}`.trim()}
        id={id}
      />
    </FieldFrame>
  );
}

export function TextareaField({
  className = "",
  error,
  hint,
  label,
  required,
  span,
  ...props
}: BaseFieldProps & Omit<ComponentProps<"textarea">, "id">) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <FieldFrame
      error={error}
      errorId={errorId}
      hint={hint}
      hintId={hintId}
      label={label}
      labelFor={id}
      required={required}
      span={span}
    >
      <textarea
        {...props}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        className={`control control-area ${className}`.trim()}
        id={id}
        rows={props.rows ?? 3}
      />
    </FieldFrame>
  );
}

export function SelectField({
  children,
  className = "",
  error,
  hint,
  label,
  required,
  span,
  ...props
}: BaseFieldProps & Omit<ComponentProps<"select">, "id">) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <FieldFrame
      error={error}
      errorId={errorId}
      hint={hint}
      hintId={hintId}
      label={label}
      labelFor={id}
      required={required}
      span={span}
    >
      <select
        {...props}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        className={`control control-select ${className}`.trim()}
        id={id}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

/** Read-only value that shares the field rhythm — e.g. a number the system assigns. */
export function ReadOnlyField({
  hint,
  label,
  span,
  value,
}: {
  hint?: ReactNode;
  label: string;
  span?: boolean;
  value: ReactNode;
}) {
  return (
    <div className={span ? "field field-span" : "field"}>
      <div className="field-label-row">
        <span className="field-label">{label}</span>
      </div>
      <output className="control control-readonly">{value}</output>
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function CheckboxField({
  description,
  label,
  ...props
}: { description?: string; label: string } & Omit<ComponentProps<"input">, "type">) {
  const id = useId();
  return (
    <div className="checkbox">
      <input {...props} id={id} type="checkbox" />
      <label htmlFor={id}>
        <span>{label}</span>
        {description ? <em>{description}</em> : null}
      </label>
    </div>
  );
}
