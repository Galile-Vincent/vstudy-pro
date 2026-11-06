import { desktop } from './bridge';

export function reportRendererError(error: unknown, phase: 'render' | 'bootstrap', componentStack?: string | null) {
  // Error messages can contain student content; report only the kind and React's component locations.
  void desktop.invoke('app:reportError', {
    phase, code: error instanceof Error ? error.name.slice(0, 100) : 'UnknownError',
    ...(componentStack ? {componentStack:componentStack.slice(0, 4000)} : {}),
  }).catch(() => {});
}
