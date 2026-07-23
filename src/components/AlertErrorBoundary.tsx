'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  dashboardName: string;
  dashboardUrl: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AlertErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Send alert to Telegram
    fetch('/api/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        severity: 'critical',
        title: `UI Crash — ${error.message.slice(0, 100)}`,
        details: `The dashboard crashed with an unhandled React error.\n\nError: ${error.message}\nComponent stack: ${error.stack?.slice(0, 300) || 'N/A'}`,
        action: 'Check recent deployments for breaking changes. The UI is down for users.',
        component: 'ErrorBoundary',
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
          <h2>⚠️ Something went wrong</h2>
          <p>An error has been reported to the team automatically.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
