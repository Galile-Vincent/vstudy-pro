import { tr } from '../../shared/i18n';
export type ReviewSelection = { courseId: string; conceptKeys: string[]; labels: string[] };
export function ArtifactPlaceholder({kind,selection}:{kind:'note'|'test';selection:ReviewSelection|null}) {
 return <section className="review-empty"><h2>{tr(`review:${kind==='note'?'notes':'tests'}`)}</h2>{selection?.labels.map(label=><span className="review-chip" key={label}>{label}</span>)}<p>{tr('review:placeholder')}</p></section>;
}
