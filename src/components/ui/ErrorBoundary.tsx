'use client';
import { Component, type ReactNode } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[ErrorBoundary]', err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid h-screen place-items-center">
          <EmptyState
            title="页面出错了"
            action={(
              <a
                className="ui-button ui-button-primary"
                href="/"
              >
                回到课程
              </a>
            )}
          >
            请回到课程后重试。
          </EmptyState>
        </div>
      );
    }
    return this.props.children;
  }
}
