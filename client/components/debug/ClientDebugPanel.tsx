'use client';

import { useEffect, useMemo, useState } from 'react';
import { clientLogger, getClientDebugEntries, type ClientLogEntry } from '@/lib/clientLogger';

export function ClientDebugPanel() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<ClientLogEntry[]>([]);
  const isDev = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    const initialEnabled = clientLogger.isEnabled();
    setEnabled(initialEnabled);
    setEntries(getClientDebugEntries());

    const interval = window.setInterval(() => {
      setEntries(getClientDebugEntries());
      setEnabled(clientLogger.isEnabled());
    }, 1200);

    return () => window.clearInterval(interval);
  }, []);

  const previewEntries = useMemo(() => entries.slice(0, 40), [entries]);

  if (!enabled && !isDev) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-4 left-4 z-[120] rounded-full border border-cyan-400/60 bg-slate-950/90 px-3 py-2 text-xs font-bold text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.28)]"
      >
        Debug {enabled ? 'On' : 'Off'}
      </button>

      {open ? (
        <div className="fixed bottom-18 left-4 z-[120] h-[70vh] w-[min(92vw,440px)] rounded-2xl border border-cyan-400/40 bg-slate-950/96 text-white shadow-[0_0_28px_rgba(34,211,238,0.2)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-bold">Client Debug Logs</p>
              <p className="text-[11px] text-white/50">{entries.length} buffered entries</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => clientLogger.setEnabled(!enabled)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-300"
              >
                {enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                type="button"
                onClick={() => {
                  clientLogger.clear();
                  setEntries([]);
                }}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/75"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="h-[calc(70vh-68px)] overflow-y-auto px-3 py-2">
            {previewEntries.length === 0 ? (
              <p className="px-2 py-3 text-sm text-white/50">No client logs yet.</p>
            ) : (
              <div className="space-y-2">
                {previewEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-cyan-300">{entry.source}</span>
                      <span className="text-[10px] uppercase text-white/45">{entry.level}</span>
                    </div>
                    <p className="mt-1 text-white/90">{entry.message}</p>
                    <p className="mt-1 text-[10px] text-white/40">{entry.timestamp}</p>
                    {entry.meta ? (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-2 text-[10px] text-white/60">
                        {JSON.stringify(entry.meta, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
