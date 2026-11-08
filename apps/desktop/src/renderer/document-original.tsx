import { useEffect, useRef, useState } from 'react';
import type { Document, DocumentContextAttachment } from '../shared/domain';
import { tr } from '../shared/i18n';
import { desktop } from './bridge';
import { captureRect, type Point } from './document-context';
import { Button } from './components/ui/button';
import './document-original.css';
export function DocumentOriginal({document:doc,pageCount,onAttach}:{document:Document;pageCount:number;onAttach:(context:DocumentContextAttachment)=>void}) {
  const [page,setPage]=useState(1),[image,setImage]=useState(''),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [previewOnly,setPreviewOnly]=useState(false),[capturing,setCapturing]=useState(false);
  const [drag,setDrag]=useState<{start:Point;end:Point}|null>(null);
  const img=useRef<HTMLImageElement>(null),viewer=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(capturing){const bounds=img.current?.getBoundingClientRect();if(bounds)setDrag({start:{x:bounds.width/4,y:bounds.height/4},end:{x:bounds.width*3/4,y:bounds.height*3/4}});viewer.current?.focus();}else setDrag(null);},[capturing]);
  const total=doc.mime==='application/pdf'?Math.max(1,pageCount):1;
  useEffect(()=>{let active=true;setImage('');setError('');setCapturing(false);setDrag(null);
    void desktop.invoke('documents:originalPage',{documentId:doc.id,page}).then(result=>{if(active){setImage(result.image);setPreviewOnly(result.previewOnly);}}).catch(()=>{if(active)setError(tr('library:original.error'));});
    return()=>{active=false;};
  },[doc.id,page,revision]);
  const attach=(region?:ReturnType<typeof captureRect>)=>{
    const element=img.current;if(!element || !element.complete || !element.naturalWidth)return;
    const bounds=element.getBoundingClientRect(),scaleX=element.naturalWidth/bounds.width,scaleY=element.naturalHeight/bounds.height;
    const rect=region??{x:0,y:0,width:bounds.width,height:bounds.height};
    const canvas=document.createElement('canvas');canvas.width=Math.round(rect.width*scaleX);canvas.height=Math.round(rect.height*scaleY);
    canvas.getContext('2d')!.drawImage(element,rect.x*scaleX,rect.y*scaleY,rect.width*scaleX,rect.height*scaleY,0,0,canvas.width,canvas.height);
    onAttach({documentId:doc.id,documentName:doc.title,page,kind:region?'region':'page',image:canvas.toDataURL('image/png')});
    setCapturing(false);setDrag(null);
  };
  const rect=drag && img.current ? captureRect(drag.start,drag.end,img.current.getBoundingClientRect()):null;
  return <div ref={viewer} className="document-original" tabIndex={0} aria-label={tr('library:original.file')} onKeyDown={event=>{
    if(capturing && drag && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(event.key)) {
      event.preventDefault();
      if(event.key==='Enter'){if(rect)attach(rect);return;}
      const dx=event.key==='ArrowLeft'?-8:event.key==='ArrowRight'?8:0,dy=event.key==='ArrowUp'?-8:event.key==='ArrowDown'?8:0;
      setDrag({start:event.shiftKey?drag.start:{x:drag.start.x+dx,y:drag.start.y+dy},end:{x:drag.end.x+dx,y:drag.end.y+dy}});return;
    }
    if(event.key==='Escape'){setCapturing(false);setDrag(null);}
    if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();setCapturing(value=>!value);}
    if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key==='Enter'){event.preventDefault();attach();}
    if(event.target===event.currentTarget && event.key==='ArrowRight')setPage(p=>Math.min(total,p+1));
    if(event.target===event.currentTarget && event.key==='ArrowLeft')setPage(p=>Math.max(1,p-1));
  }}>
    <div className="original-toolbar" role="toolbar" aria-label={tr('library:original.tools')}>
      <Button variant="ghost" disabled={page<=1} aria-label={tr('library:original.previous')} onClick={()=>setPage(p=>p-1)}>‹</Button>
      <label>{tr('library:original.page')} <input type="number" min={1} max={total} aria-label={tr('library:original.page')} value={page} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=total)setPage(n);}}/> / {total}</label>
      <Button variant="ghost" disabled={page>=total} aria-label={tr('library:original.next')} onClick={()=>setPage(p=>p+1)}>›</Button>
      <Button variant="outline" disabled={!image} aria-pressed={capturing} title={tr('library:original.shortcuts')} onClick={()=>setCapturing(value=>!value)}>{tr('library:original.capture')}</Button>
      <Button disabled={!image} title={tr('library:original.shortcuts')} onClick={()=>attach()}>{tr('library:original.sendPage')}</Button>
    </div>
    <p className="original-hint" role="status">{capturing?tr('library:original.drag'):previewOnly?tr('library:original.previewOnly'):tr('library:original.shortcuts')}</p>
    {error?<div role="alert">{error}<Button onClick={()=>setRevision(n=>n+1)}>{tr('common:retry')}</Button></div>:!image?<p role="status">{tr('common:loading_document')}</p>:<div className="original-page" data-capturing={capturing}>
      <img ref={img} src={image} alt={tr('library:original.pageAlt',{name:doc.title,page})} draggable={false}/>
      {capturing&&<div className="original-capture" onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const b=event.currentTarget.getBoundingClientRect();const start={x:event.clientX-b.left,y:event.clientY-b.top};setDrag({start,end:start});}} onPointerMove={event=>{if(!drag || !event.currentTarget.hasPointerCapture(event.pointerId))return;const b=event.currentTarget.getBoundingClientRect();setDrag({...drag,end:{x:event.clientX-b.left,y:event.clientY-b.top}});}} onPointerUp={event=>{if(!drag)return;const b=event.currentTarget.getBoundingClientRect();const region=captureRect(drag.start,{x:event.clientX-b.left,y:event.clientY-b.top},b);setDrag(null);if(region)attach(region);}} onPointerCancel={()=>setDrag(null)}>
        {rect&&<div className="original-capture-rect" style={{left:rect.x,top:rect.y,width:rect.width,height:rect.height}}/>}
      </div>}
    </div>}
  </div>;
}
