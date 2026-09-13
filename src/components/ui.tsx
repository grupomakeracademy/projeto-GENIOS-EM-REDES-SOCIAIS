'use client';
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
import { LoaderCircle, Sparkles, Inbox, X } from 'lucide-react';
import { translate, branding, type Locale } from '@/lib/i18n';
const LocaleContext = createContext<Locale>('pt-BR');
export function Language({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useT() {
  const locale = useContext(LocaleContext);
  return (key: string) => translate(locale, key);
}
export function useLocale() {
  return useContext(LocaleContext);
}
export function Button({
  children,
  busy,
  secondary = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; secondary?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`${secondary ? 'button secondary' : 'button'} ${props.className || ''}`}
    >
      {busy ? <LoaderCircle size={18} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <p>{title}</p>
      {children}
    </div>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Sparkles size={34} />
      </span>
      <span>
        <strong>{branding.short}</strong>
        <small>{branding.suffix}</small>
      </span>
    </div>
  );
}
export function Copyright({ className = '' }: { className?: string }) {
  return (
    <footer className={`copyright ${className}`.trim()}>
      © 2026 Maker Academy. Todos os direitos reservados
    </footer>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  return <span className={`badge status-${status}`}>{t(status)}</span>;
}
export function Notice({ message, error = false }: { message: string; error?: boolean }) {
  const t = useT();
  return message ? (
    <p className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {t(message)}
    </p>
  ) : null;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Modal({
  title,
  subtitle,
  icon,
  className = '',
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      className={`modal ${className}`}
      onCancel={onClose}
    >
      <header className={icon || subtitle ? 'modal-header-rich' : ''}>
        {icon && <div className="modal-header-icon">{icon}</div>}
        <div className="modal-header-text">
          <h2>{title}</h2>
          {subtitle && <p className="modal-header-subtitle">{subtitle}</p>}
        </div>
        <button className="icon-button modal-close-btn" onClick={onClose} aria-label={t('close')}>
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'internal_error');
  return data;
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false);
  async function act(fn: () => Promise<void>, success = 'saved') {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : 'internal_error');
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, error, act };
}
