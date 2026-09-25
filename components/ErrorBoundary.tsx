
import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Keeps one broken screen from blanking the whole app
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass-card border-red-500/30 p-6 md:p-10 m-4 text-center max-w-lg mx-auto mt-10">
          <AlertTriangle size={36} className="mx-auto text-red-400 mb-3" />
          <h2 className="text-lg font-bold text-white">Something went wrong on this page</h2>
          <p className="text-sm text-gray-400 mt-2 break-words font-mono text-xs bg-gray-950/60 rounded-lg p-3">
            {this.state.error.message || 'Unknown error'}
          </p>
          <p className="text-xs text-gray-500 mt-2">Your data is safe — this is a display error only.</p>
          <div className="flex gap-2 justify-center mt-5">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2.5 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold rounded-xl text-sm active:scale-95 transition-transform"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-xl text-sm active:scale-95 transition-transform"
            >
              <RotateCw size={14} /> Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
};
