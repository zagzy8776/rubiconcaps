import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../../lib/designTokens';
import { IconButton } from './Button';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
  closeOnBackdrop?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClass = 'max-w-md',
  closeOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (nodes.length === 0) {
      e.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const titleId = 'modal-title';
  const descriptionId = 'modal-description';

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-modal flex items-end sm:items-center justify-center',
        'animate-fade-in',
        'pt-[max(1rem,env(safe-area-inset-top))]',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        'px-[max(1rem,env(safe-area-inset-left))]',
        'pr-[max(1rem,env(safe-area-inset-right))]',
      )}
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full flex flex-col',
          'bg-gradient-to-br from-surface-raised to-slate-800/90',
          'border border-line-strong shadow-modal',
          'rounded-t-2xl sm:rounded-panel',
          'animate-slide-up focus:outline-none',
          'max-h-[min(92dvh,calc(100vh-2rem))]',
          widthClass,
        )}
      >
        <div
          className={cx(
            'flex items-start justify-between gap-3',
            'px-5 sm:px-6 pt-5 sm:pt-6 pb-3',
            'border-b border-line-subtle shrink-0',
            'bg-surface-raised/95 backdrop-blur-sm',
            'rounded-t-2xl sm:rounded-t-[inherit]',
          )}
        >
          <div className="min-w-0 pr-2">
            <h3 id={titleId} className="text-heading text-content-primary leading-tight">
              {title}
            </h3>
            {description && (
              <p id={descriptionId} className="text-caption text-content-secondary mt-1 leading-snug">
                {description}
              </p>
            )}
          </div>
          <IconButton size="sm" label="Close dialog" onClick={onClose} className="shrink-0 -mr-1">
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        <div className="px-5 sm:px-6 py-5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {children}
        </div>

        {footer && (
          <div className="px-5 sm:px-6 py-4 flex gap-3 shrink-0 border-t border-line-subtle bg-surface-raised z-10">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
