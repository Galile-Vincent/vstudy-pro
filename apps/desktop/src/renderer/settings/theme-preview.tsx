/** Small live previews use the same semantic colors as the full app. */
import { type CSSProperties } from "react";
import { type ThemePack } from "../../shared/themes";

export function ThemePreview({ theme, scheme }: { theme: ThemePack; scheme: 'system' | 'light' | 'dark' }) {
  return <span className="theme-preview" aria-hidden="true">
    {(scheme === 'system' ? ['light','dark'] as const : [scheme]).map(variant => {
      const t = theme[variant];
      return <span key={variant} className="theme-preview-pane" data-half={scheme === 'system' ? variant : undefined}
        style={{'--preview-bg':t.background,'--preview-side':t.sidebar,'--preview-card':t.surface,'--preview-accent':t['accent-color'],'--preview-line':t.line} as CSSProperties}>
        <span className="theme-preview-sidebar"><i/><i/><i/><i/></span>
        <span className="theme-preview-message"/><span className="theme-preview-lines"><i/><i/></span>
        <span className="theme-preview-panel"><i/><i/><i/></span>
        <span className="theme-preview-composer"><i/><b/></span>
      </span>;
    })}
  </span>;
}
