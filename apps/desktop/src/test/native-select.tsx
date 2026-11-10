import type { SelectHTMLAttributes } from 'react';

/** Native stand-in for the Astryx-backed Select so jsdom tests can drive options with fireEvent.change. */
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}
