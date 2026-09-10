import React from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary'
}) => {
  const isMobile = useIsMobile();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className={`bg-card border border-border w-full shadow-2xl p-6 ${
          isMobile
            ? 'mobile-sheet max-w-full rounded-t-2xl rounded-b-none pb-safe'
            : 'max-w-sm rounded-2xl animate-in zoom-in-95 duration-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {isMobile && <div className="sheet-handle" />}
        <h3 className="text-lg md:text-xl font-bold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{message}</p>
        
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3.5 border border-border rounded-xl font-medium hover:bg-muted transition-colors text-sm"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-3.5 rounded-xl font-semibold text-white transition-opacity hover:opacity-90 text-sm ${
              variant === 'danger' ? 'bg-destructive' : 'bg-primary'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
