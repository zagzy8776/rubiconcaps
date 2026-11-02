import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private handleReload = () => {
    // Clear leftover Google Translate state so the next load is clean
    try {
      document.cookie = 'googtrans=;path=/;max-age=0';
      document.cookie = 'googtrans=;path=/;domain=' + window.location.hostname + ';max-age=0';
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center bg-slate-950 text-white p-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-slate-400">{this.state.error.message}</p>
            <button
              type="button"
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900"
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
