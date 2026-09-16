import { useEffect, useState } from 'react';

type Props = {
  /** Called after the animation completes so the caller can start the download. */
  onComplete: () => void;
  /** Duration of the animation before firing onComplete (ms). Default 1400. */
  duration?: number;
};

/**
 * A short, tasteful "printing ticket" animation shown for ~1.4 seconds before
 * the actual PDF download fires. Purely presentational; no state after mount.
 */
export function ReceiptPrintingModal({ onComplete, duration = 1400 }: Props) {
  const [step, setStep] = useState<'printing' | 'done'>('printing');

  useEffect(() => {
    const t1 = setTimeout(() => setStep('done'), Math.max(0, duration - 300));
    const t2 = setTimeout(() => onComplete(), duration);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration, onComplete]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Printing receipt"
      className="fixed inset-0 z-[90] grid place-items-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-card bg-navy text-white shadow-elevate p-6 flex flex-col items-center">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Receipt</div>
        <div className="mt-1 text-lg font-bold">
          {step === 'printing' ? 'Printing your ticket…' : 'Ready.'}
        </div>

        <div className="mt-5 relative h-40 w-full grid place-items-center overflow-hidden">
          {/* Printer body */}
          <div className="relative">
            <svg viewBox="0 0 160 130" width="160" height="130" aria-hidden>
              <defs>
                <linearGradient id="pr" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#1e3a68" />
                  <stop offset="1" stopColor="#0b1e40" />
                </linearGradient>
              </defs>
              {/* Base */}
              <rect x="10" y="60" width="140" height="55" rx="8" fill="url(#pr)" stroke="#294d84" />
              {/* Slot */}
              <rect x="26" y="72" width="108" height="4" rx="1" fill="#000" opacity="0.55" />
              {/* Lights */}
              <circle cx="28" cy="88" r="2.5" fill="#2e9e3a" />
              <circle cx="36" cy="88" r="2.5" fill="#ffb14a" opacity="0.85" />
              {/* Top cover */}
              <rect x="30" y="46" width="100" height="18" rx="4" fill="#1e3a68" stroke="#294d84" />
              {/* Paper tray hint */}
              <rect x="40" y="40" width="80" height="8" rx="2" fill="#0b1e40" />
            </svg>

            {/* Receipt paper feeding out with dashed content lines */}
            <div
              className="absolute left-1/2 -translate-x-1/2 top-[74px] w-[110px] bg-white rounded-b-md shadow-[0_6px_16px_rgba(0,0,0,0.35)] overflow-hidden ticket-emit"
              aria-hidden
            >
              <div className="px-2 pt-2 pb-3 text-[8px] text-navy font-bold text-center">TUJYANE</div>
              <div className="px-2 space-y-1">
                <div className="h-1.5 rounded bg-slate-200" style={{ width: '80%' }} />
                <div className="h-1.5 rounded bg-slate-200" style={{ width: '55%' }} />
                <div className="h-1.5 rounded bg-slate-200" style={{ width: '70%' }} />
                <div className="h-1.5 rounded bg-slate-200" style={{ width: '40%' }} />
                <div className="h-2 rounded bg-slate-300 mt-2" style={{ width: '90%' }} />
              </div>
              {/* Zig-zag ticket edge */}
              <div className="mt-2 h-2 bg-white"
                   style={{
                     WebkitMaskImage:
                       'linear-gradient(45deg, transparent 33%, #000 33% 66%, transparent 66%), linear-gradient(-45deg, transparent 33%, #000 33% 66%, transparent 66%)',
                     WebkitMaskSize: '6px 6px, 6px 6px',
                     WebkitMaskComposite: 'source-over',
                     maskImage:
                       'linear-gradient(45deg, transparent 33%, #000 33% 66%, transparent 66%), linear-gradient(-45deg, transparent 33%, #000 33% 66%, transparent 66%)',
                     maskSize: '6px 6px, 6px 6px',
                     background:
                       'radial-gradient(circle at 3px 100%, transparent 3px, #fff 3px)',
                     backgroundSize: '6px 6px',
                     backgroundPosition: '0 0',
                   }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-white/80">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${step === 'done' ? 'bg-brand' : 'bg-white/60 animate-pulseDot'}`} />
          {step === 'done' ? 'Downloading…' : 'Preparing PDF…'}
        </div>
      </div>

      <style>{`
        @keyframes ticket-emit {
          0%   { transform: translate(-50%, -68px); opacity: 0.0; }
          25%  { opacity: 1; }
          100% { transform: translate(-50%, 8px);  opacity: 1; }
        }
        .ticket-emit {
          animation: ticket-emit 1200ms cubic-bezier(.25,.46,.45,.94) both;
        }
      `}</style>
    </div>
  );
}
