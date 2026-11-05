/** Contain view render failures while keeping shell navigation available. Retry remounts the failed content. */
import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '../../shared/i18n';
import { Button } from './ui/button';

function Recovery({ retry }: { retry: () => void }) {
  useTranslation();
  return <section role="alert" className="m-6 space-y-3 rounded-lg bg-muted p-6 text-foreground">
    <h2 className="text-lg font-semibold">{tr('common:something_went_wrong')}</h2>
    <p>{tr('common:surface_render_error')}</p>
    <Button onClick={retry}>{tr('common:retry')}</Button>
  </section>;
}

export class SurfaceErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <Recovery retry={() => this.setState({ failed: false })}/>
      : this.props.children;
  }
}
