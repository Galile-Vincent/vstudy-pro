/**
 * Visible-effect counter for ui-shots. It runs inside the page through page.evaluate, so it is one
 * self-contained function. Raw `box-shadow !== none` counts hidden elements and Astryx's transparent
 * 0px shadow lists, which made a flatter UI score worse. Here an element counts only when it is rendered
 * (non-zero box, visibility visible, opacity above zero) and a shadow layer paints something.
 *
 *   elevation       a layer with a non-transparent colour and a non-zero blur, spread or offset
 *   focusRing       only spread-only layers (0 blur, 0 offset), such as a 2px focus ring, and no elevation layer
 *   backdropFilter  rendered elements with a backdrop-filter other than none
 *   rawBoxShadow    the old metric, kept to show how far it overstated
 */
export function countEffects() {
  const alphaOf = (color) => {
    if (!color || /^transparent$/i.test(color)) return color ? 0 : 1;
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 4) return parseInt(hex[3] + hex[3], 16) / 255;
      if (hex.length === 8) return parseInt(hex.slice(6), 16) / 255;
      return 1;
    }
    const inner = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')'));
    const slash = inner.split('/');
    let raw;
    if (slash.length > 1) raw = slash[1].trim();
    else {
      const commas = inner.split(',');
      raw = commas.length === 4 ? commas[3].trim() : '1';
    }
    const value = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
    return Number.isNaN(value) ? 1 : value;
  };
  const layersOf = (value) => {
    const layers = [];
    let depth = 0, start = 0;
    for (let index = 0; index <= value.length; index++) {
      const char = value[index];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if ((char === ',' && depth === 0) || index === value.length) {
        const layer = value.slice(start, index).trim();
        start = index + 1;
        if (!layer) continue;
        const color = layer.match(/(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/i)?.[0];
        const lengths = (color ? layer.replace(color, '') : layer).match(/-?\d*\.?\d+(?:e-?\d+)?px/gi) ?? [];
        const [x = 0, y = 0, blur = 0, spread = 0] = lengths.map(parseFloat);
        layers.push({ alpha: alphaOf(color), x, y, blur, spread });
      }
    }
    return layers;
  };
  let elevation = 0, focusRing = 0, backdropFilter = 0, rawBoxShadow = 0;
  const elements = window.document.querySelectorAll('*');
  for (const element of elements) {
    const style = window.getComputedStyle(element);
    const hasShadow = style.boxShadow !== 'none';
    const hasBackdrop = (style.backdropFilter || style.webkitBackdropFilter || 'none') !== 'none';
    if (hasShadow) rawBoxShadow++;
    if (!hasShadow && !hasBackdrop) continue;
    const box = element.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0) || style.visibility !== 'visible' || !(parseFloat(style.opacity) > 0)) continue;
    if (hasBackdrop) backdropFilter++;
    if (!hasShadow) continue;
    const painted = layersOf(style.boxShadow).filter(layer => layer.alpha > 0 && (layer.x || layer.y || layer.blur || layer.spread));
    if (painted.some(layer => layer.blur || layer.x || layer.y)) elevation++;
    else if (painted.length) focusRing++;
  }
  return { elevation, focusRing, backdropFilter, rawBoxShadow, elements: elements.length };
}
