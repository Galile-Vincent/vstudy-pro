import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Scan, Paperclip } from 'lucide-react';
import { Button } from '@astryxdesign/core';
import type { Document, DocumentContextAttachment } from '../shared/domain';
import { tr } from '../shared/i18n';
import { desktop } from './bridge';
import { captureRect, type Point } from './document-context';
import './document-original.css';

type PageRecord = {status:'idle'|'loading'|'error'} | {status:'ready';image:string;previewOnly:boolean};
type PageMap = Record<number, PageRecord>;
type Selection = {page:number;start:Point;end:Point};

type OriginalProps = {document:Document;pageCount:number;initialPage?:number;onPage?:(page:number)=>void;onAttach:(context:DocumentContextAttachment)=>void};

export function DocumentOriginal(props:OriginalProps) {
  return <OriginalPages key={props.document.id} {...props}/>;
}

const PageImage=memo(function PageImage({image,alt}:{image:string;alt:string}) {return <img src={image} alt={alt} draggable={false}/>;});

function OriginalPages({document:doc,pageCount,onAttach,initialPage=1,onPage}:OriginalProps) {
  const total=doc.mime==='application/pdf'?Math.max(1,pageCount):1;
  const startPage=useRef(Math.max(1,Math.min(total,initialPage)));
  const pages=useRef<PageMap>({});
  const [,refresh]=useState(0);
  const [ratio,setRatio]=useState<number|null>(null);
  const [page,setPage]=useState(startPage.current);
  const [capturing,setCapturing]=useState(false),[drag,setDrag]=useState<Selection|null>(null);
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState('');
  const viewer=useRef<HTMLDivElement>(null),elements=useRef(new Map<number,HTMLDivElement>());
  const request=useRef<(page:number)=>void>(()=>{});
  const observePages=useRef<(entries:IntersectionObserverEntry[])=>void>(()=>{});
  const currentPage=useRef(startPage.current);
  const restored=useRef(false);

  useEffect(()=>{
    let active=true, running=0;
    const records:PageMap={}, wanted=new Set<number>([1]);
    pages.current=records;
    const update=(n:number,record:PageRecord)=>{records[n]=record;if(active)refresh(value=>value+1);};
    const pump=()=>{
      if(!active)return;
      for(const n of [...wanted].sort((a,b)=>Math.abs(a-currentPage.current)-Math.abs(b-currentPage.current))) {
        if(running>=2)break;
        const priority=currentPage.current,status=records[priority]?.status;
        if(wanted.has(priority)&&status!=='ready'&&status!=='error'&&n!==priority)continue;
        if(records[n] && records[n].status!=='idle')continue;
        running++;update(n,{status:'loading'});
        void desktop.invoke('documents:originalPage',{documentId:doc.id,page:n}).then(async result=>{
          if(n===1) {
            const image=new Image();image.src=result.image;await image.decode();
            if(active)setRatio(image.naturalWidth/image.naturalHeight);
          }
          if(active)update(n,wanted.has(n)||Math.abs(n-currentPage.current)<=4?{status:'ready',...result}:{status:'idle'});
        }).catch(()=>{update(n,{status:'error'});if(n===1&&active)setRatio(612/792);}).finally(()=>{running--;pump();});
      }
    };
    request.current=n=>{wanted.add(n);if(records[n]?.status==='error')update(n,{status:'idle'});pump();};
    observePages.current=entries=>{
      for(const entry of entries) {
        const n=Number((entry.target as HTMLElement).dataset.page);
        if(entry.isIntersecting)wanted.add(n);else wanted.delete(n);
      }
      for(const key of Object.keys(records)) {
        const n=Number(key);
        if(records[n]?.status==='ready'&&!wanted.has(n)&&Math.abs(n-currentPage.current)>4)update(n,{status:'idle'});
      }
      pump();
    };
    pump();
    return()=>{active=false;};
  },[doc.id]);

  useLayoutEffect(()=>{
    if(!ratio || restored.current)return;
    const element=elements.current.get(startPage.current),root=viewer.current;
    if(element&&root){root.scrollTop=element.offsetTop;restored.current=true;onPage?.(startPage.current);}
  },[ratio]);

  useEffect(()=>{
    const root=viewer.current;if(!root||!ratio)return;
    const observer=new IntersectionObserver(entries=>{
      trackPage();observePages.current(entries);
    },{root,rootMargin:'100% 0px'});
    elements.current.forEach(element=>observer.observe(element));
    return()=>observer.disconnect();
  },[ratio,total]);
  useEffect(()=>{if(restored.current)onPage?.(page);},[page,onPage]);

  const trackPage=()=>{
    const root=viewer.current;if(!root||!restored.current)return;
    const bounds=root.getBoundingClientRect();if(!bounds.height)return;let best=currentPage.current,area=0;
    elements.current.forEach((element,n)=>{
      const rect=element.getBoundingClientRect();
      const visible=Math.max(0,Math.min(rect.bottom,bounds.bottom)-Math.max(rect.top,bounds.top));
      if(visible>area){area=visible;best=n;}
    });
    currentPage.current=best;setPage(best);
  };
  useEffect(()=>{
    const root=viewer.current;if(!root)return;
    const observer=new ResizeObserver(trackPage);observer.observe(root);
    return()=>observer.disconnect();
  },[ratio]);
  const jump=(n:number)=>{
    const target=Math.max(1,Math.min(total,n)),element=elements.current.get(target);
    if(element&&viewer.current){viewer.current.scrollTop=element.offsetTop;currentPage.current=target;request.current(target);trackPage();}
  };
  const attach=(n:number,region?:ReturnType<typeof captureRect>)=>{
    const image=elements.current.get(n)?.querySelector('img');
    if(!image?.complete||!image.naturalWidth)return;
    const bounds=image.getBoundingClientRect();
    const scale=Math.min(bounds.width/image.naturalWidth,bounds.height/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    const offsetX=(bounds.width-width)/2,offsetY=(bounds.height-height)/2;
    const rect=region?captureRect({x:region.x-offsetX,y:region.y-offsetY},{x:region.x+region.width-offsetX,y:region.y+region.height-offsetY},{width,height}):{x:0,y:0,width,height};
    if(!rect)return;
    const canvas=document.createElement('canvas');canvas.width=Math.round(rect.width/scale);canvas.height=Math.round(rect.height/scale);
    canvas.getContext('2d')!.drawImage(image,rect.x/scale,rect.y/scale,rect.width/scale,rect.height/scale,0,0,canvas.width,canvas.height);
    onAttach({documentId:doc.id,documentName:doc.title,page:n,kind:region?'region':'page',image:canvas.toDataURL('image/png')});
    setCapturing(false);setDrag(null);
  };
  const toggleCapture=()=>{
    setCapturing(value=>!value);setDrag(null);viewer.current?.focus();
    const bounds=elements.current.get(page)?.getBoundingClientRect();
    if(!capturing&&bounds)setDrag({page,start:{x:bounds.width/4,y:bounds.height/4},end:{x:bounds.width*3/4,y:bounds.height*3/4}});
  };
  const ready=pages.current[page]?.status==='ready';
  const pageLabel=tr('library:original.pageStatus',{page,total});
  return <div className="original-reader" onKeyDown={event=>{
    if(event.key==='Escape'){setCapturing(false);setDrag(null);}
    if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();toggleCapture();return;}
    if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key==='Enter'){event.preventDefault();attach(page);return;}
    if(event.target instanceof HTMLInputElement)return;
    if(event.target instanceof Element&&event.target.closest('.document-original')&&capturing&&drag&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(event.key)) {
      event.preventDefault();
      if(event.key==='Enter'){const bounds=elements.current.get(drag.page)?.getBoundingClientRect();if(bounds){const rect=captureRect(drag.start,drag.end,bounds);if(rect)attach(drag.page,rect);}return;}
      const dx=event.key==='ArrowLeft'?-8:event.key==='ArrowRight'?8:0,dy=event.key==='ArrowUp'?-8:event.key==='ArrowDown'?8:0;
      setDrag({...drag,start:event.shiftKey?drag.start:{x:drag.start.x+dx,y:drag.start.y+dy},end:{x:drag.end.x+dx,y:drag.end.y+dy}});
    }
  }}>
    <div ref={viewer} className="document-original" role="region" tabIndex={0} aria-label={tr('library:original.file')} onScroll={trackPage}>
      {Array.from({length:ratio?total:1},(_,i)=>i+1).map(n=>{
        const record=pages.current[n]??{status:'idle'},selection=drag?.page===n?drag:null;
        const bounds=selection?elements.current.get(n)?.getBoundingClientRect():null;
        const rect=selection&&bounds?captureRect(selection.start,selection.end,bounds):null;
        return <div key={n} ref={element=>{if(element)elements.current.set(n,element);else elements.current.delete(n);}} className="original-page" role="group" data-page={n} style={{aspectRatio:ratio??612/792}} aria-label={tr('library:original.pageAlt',{name:doc.title,page:n})}>
          {record.status==='ready'?<><PageImage image={record.image} alt={tr('library:original.pageAlt',{name:doc.title,page:n})}/>{record.previewOnly&&<span className="original-preview-note">{tr('library:original.previewOnly')}</span>}</>:record.status==='error'?<div className="original-page-status" role="alert">{tr('library:original.error')}<Button label={tr('common:retry')} variant="ghost" onClick={()=>request.current(n)}>{tr('common:retry')}</Button></div>:<div className="original-page-status" role="status">{tr('common:loading_document')}</div>}
          {capturing&&record.status==='ready'&&<div className="original-capture" onPointerDown={event=>{
            if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
            const b=event.currentTarget.getBoundingClientRect(),start={x:event.clientX-b.left,y:event.clientY-b.top};setDrag({page:n,start,end:start});
          }} onPointerMove={event=>{if(!selection||!event.currentTarget.hasPointerCapture(event.pointerId))return;const b=event.currentTarget.getBoundingClientRect();setDrag({...selection,end:{x:event.clientX-b.left,y:event.clientY-b.top}});}} onPointerUp={event=>{
            if(!selection)return;const b=event.currentTarget.getBoundingClientRect(),region=captureRect(selection.start,{x:event.clientX-b.left,y:event.clientY-b.top},b);setDrag(null);if(region)attach(n,region);
          }} onPointerCancel={()=>setDrag(null)}>{rect&&<div className="original-capture-rect" style={{left:rect.x,top:rect.y,width:rect.width,height:rect.height}}/>}</div>}
        </div>;
      })}
    </div>
    <span className="original-announcement" role="status">{pageLabel}</span>
    <span className="original-announcement" role="status">{capturing?tr('library:original.drag'):''}</span>
    <div className="original-controls"><div className="original-toolbar" role="toolbar" aria-label={tr('library:original.tools')}>
      {editing?<form onSubmit={event=>{event.preventDefault();const n=Number(draft);if(Number.isInteger(n)&&n>=1&&n<=total){jump(n);setEditing(false);viewer.current?.focus();}}}><input autoFocus type="number" min={1} max={total} aria-label={tr('library:original.page')} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={()=>setEditing(false)} onKeyDown={event=>{if(event.key==='Escape'){setEditing(false);viewer.current?.focus();}}}/><span>/ {total}</span></form>:<Button label={pageLabel} variant="ghost" size="sm" onClick={()=>{setDraft(String(page));setEditing(true);}}><span>{page} / {total}</span></Button>}
      <Button label={tr('library:original.capture')} variant="ghost" size="sm" isIconOnly icon={<Scan size={16}/>} isDisabled={!ready} aria-pressed={capturing} tooltip={`${tr('library:original.capture')} · ${tr('library:original.shortcuts')} · ${tr('library:original.drag')}`} onClick={toggleCapture}/>
      <Button label={tr('library:original.sendPage')} variant="ghost" size="sm" isIconOnly icon={<Paperclip size={16}/>} isDisabled={!ready} tooltip={`${tr('library:original.sendPage')} · ${tr('library:original.shortcuts')}`} onClick={()=>attach(page)}/>
    </div></div>
  </div>;
}
