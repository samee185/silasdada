import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Common = { label: string; hint?: ReactNode; error?: string; className?: string };

export function TextField({ label, hint, error, className = '', ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <label className={`field${error ? ' has-error' : ''} ${className}`} htmlFor={id}>
      {label}
      <input id={id} className="input" aria-invalid={Boolean(error)} {...rest} />
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function TextArea({ label, hint, error, className = '', ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <label className={`field${error ? ' has-error' : ''} ${className}`} htmlFor={id}>
      {label}
      <textarea id={id} className="textarea" aria-invalid={Boolean(error)} {...rest} />
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className = '',
  children,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const id = useId();
  return (
    <label className={`field${error ? ' has-error' : ''} ${className}`} htmlFor={id}>
      {label}
      <select id={id} className="select" {...rest}>
        {children}
      </select>
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}
