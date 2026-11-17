import test from 'node:test';
import assert from 'node:assert/strict';
import { countEffects } from './shadow-metric.mjs';

const el = (style, box = { width: 10, height: 10 }) => ({ getBoundingClientRect: () => box, style: { visibility: 'visible', opacity: '1', boxShadow: 'none', backdropFilter: 'none', ...style } });
const count = (...elements) => {
  globalThis.window = { document: { querySelectorAll: () => elements }, getComputedStyle: (element) => element.style };
  try { return countEffects(); } finally { delete globalThis.window; }
};

test('counts a painted elevation but not transparent, hidden or zero-size shadows', () => {
  const result = count(
    el({ boxShadow: 'rgba(0, 0, 0, 0.12) 0px 4px 12px 0px' }),
    el({ boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px' }),
    el({ boxShadow: 'rgba(0, 0, 0, 0.2) 0px 4px 12px 0px' }, { width: 0, height: 0 }),
    el({ boxShadow: 'rgba(0, 0, 0, 0.2) 0px 4px 12px 0px', visibility: 'hidden' }),
    el({ boxShadow: 'rgba(0, 0, 0, 0.2) 0px 4px 12px 0px', opacity: '0' }),
  );
  assert.deepEqual({ elevation: result.elevation, focusRing: result.focusRing, raw: result.rawBoxShadow }, { elevation: 1, focusRing: 0, raw: 5 });
});

test('separates spread-only focus rings from elevation and handles modern colour syntax', () => {
  const result = count(
    el({ boxShadow: 'rgb(0, 100, 255) 0px 0px 0px 2px' }),
    el({ boxShadow: 'color(srgb 0 0 0 / 0.1) 0px 1px 2px 0px, rgb(0, 100, 255) 0px 0px 0px 2px' }),
    el({ boxShadow: 'oklab(0.2 0 0 / 0) 0px 8px 16px 0px' }),
    el({ boxShadow: 'rgba(0, 0, 0, 0.3) 0px 0px 0px 0px inset' }),
  );
  assert.deepEqual({ elevation: result.elevation, focusRing: result.focusRing }, { elevation: 1, focusRing: 1 });
});

test('counts rendered backdrop filters only', () => {
  const result = count(el({ backdropFilter: 'blur(8px)' }), el({ backdropFilter: 'blur(8px)' }, { width: 0, height: 0 }));
  assert.equal(result.backdropFilter, 1);
});
