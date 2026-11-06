/** Deterministic course artwork. Only layout values and semantic token references enter CSS. */
import type { CSSProperties } from 'react';

import '../../shell/soft-art.css';

const colors = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

/** Stable artwork identity includes the term so repeated enrollments have a distinct cover. */
export function courseArt(id: string, term: string | null) {
  let hash = 2166136261;
  for (const character of `${id}:${term ?? ''}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return {
    style: {
      '--course-color': `var(${colors[hash % colors.length]})`,
      '--art-hue-offset': `${(hash >>> 12) % 71 - 35}`,
      '--art-hue-gap': `${30 + (hash >>> 20) % 21}`,
      '--art-x': `${20 + hash % 65}%`,
      '--art-y': `${10 + (hash >>> 8) % 60}%`,
    } as CSSProperties,
  };
}
