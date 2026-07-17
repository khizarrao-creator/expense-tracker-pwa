import React, { useEffect, useRef } from 'react';
import { X, CheckCircle, Info, ShieldAlert } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'default' | 'danger' | 'success' | 'info';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlay?: boolean;
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'default',
  size = 'md',
  closeOnOverlay = true,
  showCloseButton = true,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus modal container only when opened
  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
    }
  }, [isOpen]);

  // Esc key closure and scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Body scroll lock
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full h-full rounded-none',
  };

  const icons = {
    default: null,
    danger: <ShieldAlert className="text-destructive h-6 w-6 shrink-0" />,
    success: <CheckCircle className="text-success h-6 w-6 shrink-0" />,
    info: <Info className="text-primary h-6 w-6 shrink-0" />,
  };

  const headerBgs = {
    default: '',
    danger: 'bg-destructive/5 border-b border-destructive/10',
    success: 'bg-success/5 border-b border-success/10',
    info: 'bg-primary/5 border-b border-primary/10',
  };

  const modalMarkup = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={() => closeOnOverlay && onClose()}
      />

      {/* Modal Card */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative bg-card text-card-foreground w-full ${sizes[size]} rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col focus:outline-none animate-in zoom-in-95 duration-200 z-10`}
      >
        {/* Header */}
        {(title || description || showCloseButton) && (
          <div className={`p-6 flex items-start gap-4 ${headerBgs[variant]}`}>
            {icons[variant]}
            <div className="flex-1 min-w-0 space-y-1 text-left">
              {title && (
                <h2 className="text-lg font-bold leading-tight truncate text-foreground">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-xs text-muted-foreground leading-normal">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all shrink-0 active:scale-95"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        {children && (
          <div className="px-6 py-5 flex-1 overflow-y-auto max-h-[70vh] text-sm text-left leading-relaxed">
            {children}
          </div>
        )}

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border/40 bg-muted/10 flex items-center justify-end gap-3 rounded-b-3xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalMarkup, document.body);
};
