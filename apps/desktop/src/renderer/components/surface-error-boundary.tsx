/** Contain view render failures while keeping shell navigation available. Retry remounts the failed content. */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { reportRendererError } from '../renderer-errors';
import { Button } from '@astryxdesign/core';

function Recovery({ retry }: { retry: () => void }) {
  useTranslation();
  return <section role="alert" className="m-6 space-y-3 rounded-lg bg-muted p-6 text-foreground">
    <h2 className="text-lg font-semibold">{tr('common:something_went_wrong')}</h2>
    <p>{tr('common:surface_render_error')}</p>
    <Button label={tr('common:retry')} onClick={retry} />
  </section>;
}

export class SurfaceErrorBoundary extends Component<{ children: ReactNode; resetKeys?: readonly unknown[] }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { reportRendererError(error, 'render', info.componentStack); }
  componentDidUpdate(previous: Readonly<typeof this.props>) {
    const before = previous.resetKeys ?? [], after = this.props.resetKeys ?? [];
    if (this.state.failed && (before.length !== after.length || before.some((key, index) => !Object.is(key, after[index])))) this.setState({ failed: false });
  }
  render() {
    return this.state.failed
      ? <Recovery retry={() => this.setState({ failed: false })}/>
      : this.props.children;
  }
}
