/** Lightweight, deterministic artwork shared by document cards. Never contains document text. */
import { courseArt } from '../courses/art/cover';
import './soft-art.css';

/** Stable geometry gives each document its own cover without loading an image. */
export function DocumentArt({ id, kind = 'MD' }: { id: string; kind?: string }) {
  return <div className="art-reader-cover soft-art" aria-hidden="true" style={courseArt(id, null).style}>
    <span className="art-reader-cover-type">{kind}</span>
  </div>;
}
