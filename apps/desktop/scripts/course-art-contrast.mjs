/** Check cover labels and the hero's minimum 90% scrim against a worst-case white image. */
import { contrastRatio } from '../src/shared/themes/index.ts';

/** The opacity floor matches the text region of .moodle-hero .moodle-art-scrim in surfaces.css. */
export function courseArtContrast(tokens, scheme) {
  const foreground = scheme === 'light' ? tokens.surface : tokens.ink;
  const base = scheme === 'light' ? tokens.ink : tokens.background;
  const scrim = '#' + [1,3,5].map(index => Math.round(parseInt(base.slice(index,index+2),16)*.9+255*.1).toString(16).padStart(2,'0')).join('');
  return {label:contrastRatio(foreground,base),hero:contrastRatio(foreground,scrim)};
}
