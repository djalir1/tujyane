import {
  createContext, useCallback, useContext,
  useEffect, useMemo, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export type Toast = {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  durationMs?: number;
};

type Ctx = {
  push: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const dismiss = useCallback((id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current[id];
    if (t) { window.clearTimeout(t); delete timers.current[id]; }
  }, []);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    const toast: Toast = { durationMs: 4500, ...t, id };
    setItems((xs) => [...xs, toast]);
    if (toast.durationMs && toast.durationMs > 0) {
      timers.current[id] = window.setTimeout(() => dismiss(id), toast.durationMs);
    }
    return id;
  }, [dismiss]);

  useEffect(() => {
    return () => { Object.values(timers.current).forEach((t) => window.clearTimeout(t)); };
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed z-[100] top-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
      >
        {items.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const styles: Record<ToastKind, { border: string; icon: ReactNode }> = {
    success: { border: 'border-l-brand', icon: <Dot className="bg-brand" /> },
    error:   { border: 'border-l-danger', icon: <Dot className="bg-danger" /> },
    info:    { border: 'border-l-[rgb(var(--accent))]', icon: <Dot className="bg-[rgb(var(--accent))]" /> },
    warning: { border: 'border-l-warning', icon: <Dot className="bg-warning" /> },
  };
  const s = styles[toast.kind];
  return (
    <div
      role="status"
      className={[
        'pointer-events-auto flex items-start gap-3 pr-3 pl-3.5 py-3 rounded-card border border-border',
        'bg-bg-elevated shadow-elevate animate-toastIn',
        'border-l-4', s.border,
      ].join(' ')}
    >
      <div className="mt-1.5">{s.icon}</div>
      <div className="flex-1 min-w-0">
        {toast.title && <div className="text-sm font-semibold text-text truncate">{toast.title}</div>}
        <div className="text-sm text-text-muted">{toast.message}</div>
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 h-8 w-8 rounded-md grid place-items-center text-text-muted hover:text-text hover:bg-surface-hover"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Dot({ className = '' }: { className?: string }) {
  return <span className={['inline-block h-2 w-2 rounded-full', className].join(' ')} />;
}
