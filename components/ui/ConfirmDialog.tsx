
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

// Promise-based confirm/alert dialogs — a single host is mounted at the app root.
// Usage:
//   import { confirmDialog, alertDialog } from './ui/ConfirmDialog';
//   if (await confirmDialog({ title: 'Delete item?', message: 'This cannot be undone.', danger: true })) { ... }

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Request = ConfirmOptions & { resolve: (v: boolean) => void };
type AlertRequest = { title: string; message?: string; resolve: () => void };

let confirmListener: ((r: Request) => void) | null = null;
let alertListener: ((r: AlertRequest) => void) | null = null;

export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> =>
  new Promise((resolve) => {
    if (confirmListener) confirmListener({ ...opts, resolve });
  });

export const alertDialog = (opts: { title: string; message?: string }): Promise<void> =>
  new Promise((resolve) => {
    if (alertListener) alertListener({ ...opts, resolve });
  });

export const DialogHost: React.FC = () => {
  const [confirmReq, setConfirmReq] = useState<Request | null>(null);
  const [alertReq, setAlertReq] = useState<AlertRequest | null>(null);

  useEffect(() => {
    confirmListener = (r) => setConfirmReq(r);
    alertListener = (r) => setAlertReq(r);
    return () => { confirmListener = null; alertListener = null; };
  }, []);

  const closeConfirm = (value: boolean) => {
    confirmReq?.resolve(value);
    setConfirmReq(null);
  };

  const closeAlert = () => {
    alertReq?.resolve();
    setAlertReq(null);
  };

  return (
    <>
      {confirmReq && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => closeConfirm(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative bg-gray-900 border-t sm:border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 animate-slide-up"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${confirmReq.danger ? 'bg-red-500/10 text-red-400' : 'bg-gold-500/10 text-gold-500'}`}>
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-white text-base">{confirmReq.title}</h3>
                {confirmReq.message && <p className="text-sm text-gray-400 mt-1 whitespace-pre-line">{confirmReq.message}</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => closeConfirm(false)}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-sm font-bold active:scale-95 transition-transform"
              >
                {confirmReq.cancelLabel || 'Cancel'}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                autoFocus
                className={`flex-1 py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform ${
                  confirmReq.danger
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-gradient-to-r from-gold-500 to-amber-400 text-black'
                }`}
              >
                {confirmReq.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertReq && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeAlert} />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative bg-gray-900 border-t sm:border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 animate-slide-up"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl shrink-0 bg-gold-500/10 text-gold-500">
                <Info size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-white text-base">{alertReq.title}</h3>
                {alertReq.message && <p className="text-sm text-gray-400 mt-1 whitespace-pre-line">{alertReq.message}</p>}
              </div>
            </div>
            <button
              onClick={closeAlert}
              autoFocus
              className="w-full py-3 mt-5 bg-gradient-to-r from-gold-500 to-amber-400 text-black rounded-xl text-sm font-bold active:scale-95 transition-transform"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
};
