import { Component, type ComponentChildren } from 'preact';
import { initSentry, captureException } from '../lib/sentry';

interface Props {
  children: ComponentChildren;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    initSentry();
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    captureException(error, {
      componentStack: errorInfo.componentStack ?? '',
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div class="flex items-center justify-center min-h-[300px] p-8">
          <div class="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center shadow-sm">
            <div class="text-4xl mb-4">⚠️</div>
            <h2 class="text-xl font-black text-gray-900 mb-2">
              問題が発生しました
            </h2>
            <p class="text-gray-500 mb-6 text-sm">
              {this.props.fallbackMessage || 'エラーが発生しました。ページを再読み込みしてください。'}
            </p>
            <button
              onClick={this.handleReload}
              class="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-colors"
            >
              ページを再読み込み
            </button>
            {this.state.error && (
              <details class="mt-4 text-left">
                <summary class="text-xs text-gray-400 cursor-pointer">エラー詳細</summary>
                <pre class="mt-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
