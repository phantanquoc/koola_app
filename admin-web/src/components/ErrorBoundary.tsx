import { Component } from 'react';
import type { ReactNode } from 'react';
import i18n from '../i18n';
import StateBlock from './StateBlock';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Root error boundary (P1 Foundation). Catches render crashes anywhere below
 * and shows a 5xx-style retry screen (DESIGN.md §10) instead of a blank page.
 * Reset = full reload, the only reliable recovery for unknown render state.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    if (import.meta.env.DEV) {
      console.debug('[ErrorBoundary] uncaught render error', error);
    }
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div className="page-stack" style={{ padding: 'var(--space-7)' }}>
          <StateBlock
            variant="empty"
            icon="!"
            title={i18n.t('errorBoundary.title')}
            copy={i18n.t('errorBoundary.copy')}
          >
            <button type="button" className="btn btn-primary btn-sm" onClick={this.handleRetry}>
              {i18n.t('errorBoundary.retry')}
            </button>
          </StateBlock>
        </div>
      );
    }
    return this.props.children;
  }
}
