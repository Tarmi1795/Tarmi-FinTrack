import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Wide layout for content that needs desktop breathing room (e.g. pricing). */
  wide?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, wide = false }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Mobile: bottom sheet. sm+: centered dialog. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative bg-gray-900 border-t sm:border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[88dvh] sm:max-h-[90vh] animate-slide-up ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>
        <div className="flex items-center justify-between pl-4 pr-2 py-3 border-b border-gray-800 shrink-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-100 truncate pr-2">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2.5 -mr-1 rounded-lg active:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors touch-manipulation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
};
