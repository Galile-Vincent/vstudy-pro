/** Lightweight, deterministic artwork shared by document cards. Never contains document text. */
import type { CSSProperties } from 'react';

/** Stable geometry gives each document its own cover without loading an image. */
export function DocumentArt({ id, kind = 'MD' }: { id: string; kind?: string }) {
  const seed = Array.from(id).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  return <div className="art-reader-cover" data-motif={seed % 3} aria-hidden="true" style={{ '--art-reader-angle': `${100 + seed % 160}deg` } as CSSProperties}>
    <span className="art-reader-orbit"/><span className="art-reader-orbit"/><span className="art-reader-cover-type">{kind}</span>
  </div>;
}
