/**
 * Validate complete light and dark theme packs and derive contrast-adjusted token colors.
 * Owned by shared/themes.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
/** Whole-system theme packs. Imported colors are opaque hex values, never executable CSS. */
import { z } from 'zod';
import palettes from './palettes.json' with { type: 'json' };

export const tokenNames = [
  'background', 'surface', 'sidebar', 'subtle', 'active', 'ink', 'muted', 'line',
  'accent-color', 'accent-foreground', 'selection-color', 'focus',
  'danger', 'success', 'warning', 'info', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'glass-tint', 'shadow-color', 'reader-background', 'reader-ink', 'code-background',
  'syntax-keyword', 'syntax-string', 'syntax-number', 'course-start', 'course-end',
] as const;
export type ThemeToken = typeof tokenNames[number];
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const themeTokensSchema = z.object(Object.fromEntries(
  tokenNames.map(key => [key, colorSchema]),
) as Record<ThemeToken, typeof colorSchema>).strict();
export type ThemeTokens = z.infer<typeof themeTokensSchema>;
/** A complete light and dark pack with opaque color tokens, inert metadata, and no unknown fields. */
export const themePackSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  name: z.string().trim().min(1).max(60),
  light: themeTokensSchema,
  dark: themeTokensSchema,
  orbs: z.object({ light: z.tuple([colorSchema, colorSchema]), dark: z.tuple([colorSchema, colorSchema]) }).strict(),
}).strict();
export type ThemePack = z.infer<typeof themePackSchema>;
export type ColorScheme = 'light' | 'dark';
/** Persist scheme and pack selection with bounded contrast, opacity, and custom pack inventory. */
export const themePreferencesSchema = z.object({
  themeId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).default('vstudy'),
  colorScheme: z.enum(['system', 'light', 'dark']).default('system'),
  contrast: z.number().int().min(100).max(150).default(100),
  cardTransparency: z.enum(['solid', 'soft', 'glass']).default('solid'),
  glassOpacity: z.number().int().min(50).max(100).default(80),
  customThemes: z.array(themePackSchema).max(30).superRefine((themes, context) => {
    const ids = new Set(palettes.map(p => p.id));
    for (const theme of themes) {
      if (ids.has(theme.id)) context.addIssue({code:z.ZodIssueCode.custom,message:'Theme IDs must be unique and cannot replace built-ins.'});
      ids.add(theme.id);
    }
  }).default([]),
});
export type ThemePreferences = z.infer<typeof themePreferencesSchema>;

function tokens(colors: string[], scheme: ColorScheme): ThemeTokens {
  const [background, surface, sidebar, active, ink, muted, line, accent] = colors as [string,string,string,string,string,string,string,string];
  const dark = scheme === 'dark';
  return {
    background, surface, sidebar, subtle: sidebar, active, ink, muted, line,
    'accent-color': accent, 'accent-foreground': background, 'selection-color': active, focus: accent,
    danger: dark ? '#ffb4b4' : '#a52238', success: dark ? '#a4dcb0' : '#28613a',
    warning: dark ? '#f5d087' : '#775315', info: accent,
    'chart-1': accent, 'chart-2': dark ? '#a4dcb0' : '#28613a',
    'chart-3': dark ? '#f5d087' : '#775315', 'chart-4': dark ? '#e4b8f5' : '#78418f',
    'chart-5': dark ? '#ffb4b4' : '#a52238',
    'glass-tint': surface, 'shadow-color': dark ? background : ink,
    'reader-background': surface, 'reader-ink': ink, 'code-background': background,
    'syntax-keyword': dark ? '#e4b8f5' : '#78418f',
    'syntax-string': dark ? '#a4dcb0' : '#28613a',
    'syntax-number': dark ? '#f5d087' : '#775315',
    'course-start': sidebar, 'course-end': active,
  };
}

export const builtinThemes: ThemePack[] = palettes.map(p => themePackSchema.parse({
  version: 1, id: p.id, name: p.name,
  light: tokens(p.light, 'light'), dark: tokens(p.dark, 'dark'),
  orbs: { light: [p.light[1], p.light[7]], dark: [p.dark[0], p.dark[7]] },
}));

/** Resolve removed or unknown custom themes to the shipped default. */
export function resolveTheme(preferences: ThemePreferences): ThemePack {
  return builtinThemes.find(t => t.id === preferences.themeId)
    ?? preferences.customThemes.find(t => t.id === preferences.themeId)
    ?? builtinThemes[0]!;
}

/** Compute WCAG relative-luminance contrast for validated opaque colors. */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i]!, 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

/** Text must meet AA. Boundaries and focus indicators must meet non-text AA. */
export function contrastFailures(tokens: ThemeTokens): string[] {
  const pairs: [ThemeToken, ThemeToken, number][] = [];
  for (const bg of ['background','surface','sidebar','subtle','active','selection-color'] as const) {
    for (const fg of ['ink','muted','accent-color','danger','success','warning','info'] as const) pairs.push([fg,bg,4.5]);
    pairs.push(['focus',bg,3]);
  }
  for (const bg of ['background','surface','sidebar'] as const) pairs.push(['line',bg,3]);
  pairs.push(['accent-foreground','accent-color',4.5], ['reader-ink','reader-background',4.5]);
  for (const fg of ['syntax-keyword','syntax-string','syntax-number'] as const) pairs.push([fg,'code-background',4.5]);
  for (const fg of ['chart-1','chart-2','chart-3','chart-4','chart-5'] as const) pairs.push([fg,'surface',3]);
  return pairs.filter(([fg,bg,min]) => contrastRatio(tokens[fg],tokens[bg]) < min)
    .map(([fg,bg,min]) => `${fg} / ${bg}: ${contrastRatio(tokens[fg],tokens[bg]).toFixed(2)} < ${min}`);
}

/** Contrast only increases foreground strength. Surface colors keep their theme identity. */
export function adjustedTokens(tokens: ThemeTokens, scheme: ColorScheme, contrast: number): ThemeTokens {
  const result = { ...tokens };
  const amount = (contrast - 100) / 100;
  for (const key of ['ink','muted','line','focus','reader-ink'] as const) {
    const hex = tokens[key];
    result[key] = '#' + [1,3,5].map(i => {
      const c = parseInt(hex.slice(i,i+2),16);
      return Math.round(c + ((scheme === 'dark' ? 255 : 0) - c) * amount).toString(16).padStart(2,'0');
    }).join('');
  }
  return result;
}

/** JSON imports are bounded, strictly validated, and cannot replace built-in IDs. */
export function importTheme(json: string): ThemePack {
  if (new TextEncoder().encode(json).length > 32_768) throw new Error('THEME_TOO_LARGE');
  const theme = themePackSchema.parse(JSON.parse(json));
  if (builtinThemes.some(t => t.id === theme.id)) throw new Error('THEME_RESERVED_ID');
  return theme;
}
