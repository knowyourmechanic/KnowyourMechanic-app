import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}
interface State {
    hasError: boolean;
    message: string;
    stack: string;
}

/**
 * App-wide safety net. Without this, any render-time error unmounts the whole
 * React tree and the user sees a blank screen. This catches the error, logs it,
 * and shows a recoverable fallback. In dev it surfaces the actual error so we
 * can pinpoint frequent crashes; in production the details stay hidden.
 */
export default class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, message: '', stack: '' };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, message: error?.message || 'Unknown error', stack: error?.stack || '' };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary]', error?.message, error?.stack, info.componentStack);
    }

    private reset = () => this.setState({ hasError: false, message: '', stack: '' });

    render() {
        if (!this.state.hasError) return this.props.children;
        const isDev = import.meta.env.DEV;
        return (
            <div
                style={{
                    minHeight: '100vh', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', padding: 24,
                    textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif',
                    color: 'var(--eb-fg)', background: 'var(--eb-bg)', gap: 4,
                }}
            >
                {/* Theme tokens scoped to this fallback, following the OS preference. */}
                <style>{`:root{--eb-bg:#f8fafc;--eb-fg:#0f172a;--eb-muted:#64748b;--eb-card:#fff;--eb-border:#e2e8f0}@media (prefers-color-scheme:dark){:root{--eb-bg:#0b111b;--eb-fg:#e8eef7;--eb-muted:#93a2b8;--eb-card:#121b29;--eb-border:#223047}}`}</style>
                <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Something went wrong</h1>
                <p style={{ color: 'var(--eb-muted)', fontSize: 14, maxWidth: 340, margin: '0 0 20px' }}>
                    This page hit an unexpected error. Try again, or go back home.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        onClick={this.reset}
                        style={{
                            background: 'transparent', color: 'var(--eb-fg)', border: '1px solid var(--eb-border)',
                            borderRadius: 12, padding: '12px 22px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                        }}
                    >
                        Try again
                    </button>
                    <button
                        onClick={() => { window.location.href = '/'; }}
                        style={{
                            background: '#2563eb', color: 'white', border: 'none',
                            borderRadius: 12, padding: '12px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                        }}
                    >
                        Go home
                    </button>
                </div>
                {isDev && this.state.message && (
                    <pre
                        style={{
                            marginTop: 24, textAlign: 'left', maxWidth: 'min(680px, 92vw)', overflow: 'auto',
                            background: 'var(--eb-card)', border: '1px solid var(--eb-border)', borderRadius: 12,
                            padding: 16, fontSize: 12, lineHeight: 1.5, color: 'var(--eb-muted)',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}
                    >
                        <b style={{ color: 'var(--eb-fg)' }}>{this.state.message}</b>
                        {'\n\n'}{this.state.stack.split('\n').slice(0, 8).join('\n')}
                    </pre>
                )}
            </div>
        );
    }
}
