import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught render error', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ error: null });
    this.props.onReset?.();
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-3xl border border-rose-200 bg-white p-8 shadow-sm space-y-4">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-rose-500">Something went wrong</p>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            {this.props.title ?? 'Linegra hit an unexpected error'}
          </h1>
          <p className="text-sm text-slate-600">
            The page stopped rendering to avoid a blank screen. You can reload and continue working; if this keeps
            happening, note what you were doing and check the browser console.
          </p>
          <pre className="text-xs text-slate-500 bg-slate-50 rounded-2xl p-4 overflow-auto max-h-40">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-[0.2em]"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
