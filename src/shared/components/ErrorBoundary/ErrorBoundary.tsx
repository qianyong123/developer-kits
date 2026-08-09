import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { messages } from '@/shared/i18n/zh';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** 页面级错误边界：单个工具崩溃时显示可读提示，不白屏、不影响其他工具。 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className={styles.box} role="alert">
          <h2 className={styles.title}>{messages.app.errorTitle}</h2>
          <p className={styles.message}>{this.state.error.message}</p>
          <button className={styles.retry} onClick={() => this.setState({ error: null })}>
            {messages.app.errorRetry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
