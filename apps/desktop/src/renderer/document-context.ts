import type { DocumentContextAttachment } from '../shared/domain';
export type Point = {x:number; y:number};
export type CaptureRect = Point & {width:number; height:number};
export function captureRect(start:Point,end:Point,bounds:{width:number;height:number}):CaptureRect | null {
  if (![start.x,start.y,end.x,end.y,bounds.width,bounds.height].every(Number.isFinite) || bounds.width<=0 || bounds.height<=0) return null;
  const clamp=(n:number,max:number)=>Math.max(0,Math.min(max,n));
  const x=clamp(Math.min(start.x,end.x),bounds.width),y=clamp(Math.min(start.y,end.y),bounds.height);
  const width=clamp(Math.max(start.x,end.x),bounds.width)-x,height=clamp(Math.max(start.y,end.y),bounds.height)-y;
  return width>=4 && height>=4 ? {x,y,width,height} : null;
}
export function contextLabel(context:Pick<DocumentContextAttachment,'documentName'|'page'|'kind'>) {
  return `${context.documentName} · ${context.page}`;
}
