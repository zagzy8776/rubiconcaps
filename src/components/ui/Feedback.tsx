import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { cx } from '../../lib/designTokens';
import { Button } from './Button';

/** Shimmering placeholder block (Req 11.1). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton rounded-lg', className)} />;
}

export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cx('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Skeleton matching the account card layout (Req 11.1). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'flex items-center justify-between gap-4 rounded-card border border-line-subtle bg-surface-raised/40 p-4',
        className,
      )}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <Skeleton className="w-12 h-12 rounded-card shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="space-y-2 w-24">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <Loader2 className={cx('w-5 h-5 text-brand-400 animate-spin', className)} aria-hidden="true" />
    </span>
  );
}

export interface LoadingStateProps {
  /** Status text announced to assistive technology. */
  label?: string;
  /** Skeleton body rendered beneath the label. */
  children?: ReactNode;
  /** Milliseconds before the slow-connection message appears (Req 11.4). */
  timeoutMs?: number;
  timeoutMessage?: string;
  className?: string;
}

/**
 * Loading feedback with timeout handling: after `timeoutMs` a reassuring
 * message is shown so the user knows the request has not silently failed.
 */
export function LoadingState({
  label = 'Loading…',
  children,
  timeoutMs = 8000,
  timeoutMessage = 'Still working on it — slower connections can take a little longer.',
  className,
}: LoadingStateProps) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs]);

  return (
    <div className={cx('py-10', className)} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 mb-6">
        <Spinner className="w-7 h-7" />
        <span className="text-content-secondary text-sm">{label}</span>
      </div>
      {children ?? <SkeletonList />}
      {timedOut && <p className="text-center text-caption text-content-muted mt-6">{timeoutMessage}</p>}
    </div>
  );
}

export interface ErrorStateProps {
  /** Plain English description of what went wrong (Req 11.5). */
  message: string;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  hint?: string;
  className?: string;
}

export function ErrorState({
  message,
  title = 'We could not load this',
  onRetry,
  retryLabel = 'Try again',
  hint = 'If the problem continues, contact client services on +1 (213) 606-1732.',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cx(
        'rounded-card border border-red-500/25 bg-red-500/5 px-6 py-8 text-center',
        className,
      )}
    >
      <div className="w-12 h-12 rounded-card bg-red-500/10 flex items-center justify-center mx-auto mb-4">
        <TriangleAlert className="w-6 h-6 text-red-400" aria-hidden="true" />
      </div>
      <h3 className="text-heading text-content-primary mb-1.5">{title}</h3>
      <p className="text-sm text-content-secondary mb-5 max-w-md mx-auto">{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          {retryLabel}
        </Button>
      )}
      {hint && <p className="text-caption text-content-muted mt-5">{hint}</p>}
    </div>
  );
}