'use client';
import { Component, type ReactNode } from 'react';

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
        <div className="w-screen h-screen flex flex-col items-center justify-center gap-6 bg-bunny-bg-cream">
          <svg viewBox="0 0 200 200" width={180} height={180} aria-hidden>
            <circle cx="100" cy="100" r="40" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="3" />
            <ellipse cx="80" cy="40" rx="9" ry="32" fill="#FCEBE3" stroke="#F4B5B0" strokeWidth="2" />
            <ellipse cx="120" cy="40" rx="9" ry="32" fill="#FCEBE3" stroke="#F4B5B0" strokeWidth="2" />
            <circle cx="86" cy="98" r="3" fill="#4B3F35" />
            <circle cx="114" cy="98" r="3" fill="#4B3F35" />
            <path d="M 90 115 Q 100 108 110 115" stroke="#4B3F35" strokeWidth="2" fill="none" />
          </svg>
          <p className="font-zh text-2xl text-bunny-ink">哎呀,出了一点点问题</p>
          <a
            href="/"
            className="px-6 py-3 rounded-bunny-md bg-bunny-pink text-bunny-ink font-zh"
          >
            回院子
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
