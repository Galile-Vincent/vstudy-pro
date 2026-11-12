// @vitest-environment jsdom
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Document } from '../shared/domain';
import { DocumentOriginal } from './document-original';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('./bridge',()=>({desktop:{invoke}}));
vi.mock('@astryxdesign/core',()=>({Button:({label,children,onClick,isDisabled}:{label:string;children?:React.ReactNode;onClick?:()=>void;isDisabled?:boolean})=><button aria-label={label} disabled={isDisabled} onClick={onClick}>{children}</button>}));
const doc={id:'doc',title:'Lecture',mime:'application/pdf'} as Document;
let intersect:(entries:{target:Element;isIntersecting:boolean}[])=>void;
beforeEach(()=>{
  invoke.mockReset().mockResolvedValue({image:'data:image/png;base64,abc',previewOnly:false});
  vi.stubGlobal('IntersectionObserver',class {constructor(cb:typeof intersect){intersect=cb;}observe(){}disconnect(){}});
  vi.stubGlobal('Image',class {naturalWidth=600;naturalHeight=800;decode(){return Promise.resolve();}});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const n=Number(this.closest('[data-page]')?.getAttribute('data-page'));
    const top=n?(n-1)*800-(document.querySelector('.document-original')?.scrollTop??0):0;
    return {top,bottom:top+800,left:0,right:600,width:600,height:800,x:0,y:top,toJSON(){}};
  });
  vi.spyOn(HTMLElement.prototype,'offsetTop','get').mockImplementation(function(this:HTMLElement){return (Number(this.dataset.page)-1)*800;});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('loads nearby pages once and reports the most visible page',async()=>{
  const onPage=vi.fn();const {container}=render(<DocumentOriginal document={doc} pageCount={12} onPage={onPage} onAttach={()=>{}}/>);
  await waitFor(()=>expect(container.querySelectorAll('.original-page')).toHaveLength(12));expect(invoke).toHaveBeenCalledTimes(1);
  const third=container.querySelector('[data-page="3"]')!;
  await act(async()=>intersect([{target:third,isIntersecting:true}]));expect(screen.getByAltText('Lecture, page 3')).toBeTruthy();
  await act(async()=>intersect([{target:third,isIntersecting:true}]));expect(invoke).toHaveBeenCalledTimes(2);
  const root=container.querySelector('.document-original')!;root.scrollTop=1500;fireEvent.scroll(root);
  expect(onPage).toHaveBeenLastCalledWith(3);expect(screen.getByRole('button',{name:'Page'}).textContent).toBe('3 / 12');
});
it('restores the last page and jumps after submitting a page number',async()=>{
  const onPage=vi.fn();const {container}=render(<DocumentOriginal document={doc} pageCount={12} initialPage={6} onPage={onPage} onAttach={()=>{}}/>);
  await waitFor(()=>expect(container.querySelector('.document-original')?.scrollTop).toBe(4000));
  fireEvent.click(screen.getByRole('button',{name:'Page'}));const input=screen.getByRole('spinbutton',{name:'Page'});fireEvent.change(input,{target:{value:'10'}});
  expect(container.querySelector('.document-original')?.scrollTop).toBe(4000);fireEvent.submit(input.closest('form')!);
  expect(container.querySelector('.document-original')?.scrollTop).toBe(7200);expect(onPage).toHaveBeenLastCalledWith(10);
});
it('captures the page under the pointer',async()=>{
  const onAttach=vi.fn();const {container}=render(<DocumentOriginal document={doc} pageCount={6} onAttach={onAttach}/>);
  await waitFor(()=>expect(container.querySelectorAll('.original-page')).toHaveLength(6));
  await act(async()=>intersect([{target:container.querySelector('[data-page="3"]')!,isIntersecting:true}]));
  const image=screen.getByAltText('Lecture, page 3');Object.defineProperties(image,{complete:{value:true},naturalWidth:{value:600},naturalHeight:{value:800}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,crop');vi.stubGlobal('PointerEvent',MouseEvent);
  fireEvent.click(screen.getByRole('button',{name:'Capture region'}));const overlay=container.querySelector('[data-page="3"] .original-capture') as HTMLElement;
  overlay.setPointerCapture=vi.fn();overlay.hasPointerCapture=()=>true;
  fireEvent.pointerDown(overlay,{button:0,clientX:20,clientY:1620});fireEvent.pointerUp(overlay,{clientX:120,clientY:1720});
  expect(onAttach).toHaveBeenCalledWith(expect.objectContaining({page:3,kind:'region'}));
});
it('retries a failed page',async()=>{
  invoke.mockRejectedValueOnce(new Error('failed'));render(<DocumentOriginal document={doc} pageCount={1} onAttach={()=>{}}/>);
  await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByAltText('Lecture, page 1');expect(invoke).toHaveBeenCalledTimes(2);
});
it('limits background rendering to two pages at a time',async()=>{
  const {container}=render(<DocumentOriginal document={doc} pageCount={8} onAttach={()=>{}}/>);
  await waitFor(()=>expect(container.querySelectorAll('.original-page')).toHaveLength(8));
  const resolves:(()=>void)[]=[];
  invoke.mockImplementation(()=>new Promise(resolve=>resolves.push(()=>resolve({image:'data:image/png;base64,page',previewOnly:false}))));
  await act(async()=>intersect([2,3,4,5].map(n=>({target:container.querySelector(`[data-page="${n}"]`)!,isIntersecting:true}))));
  expect(invoke).toHaveBeenCalledTimes(3);
  await act(async()=>resolves.shift()!());expect(invoke).toHaveBeenCalledTimes(4);
});
it('treats an image original as one page regardless of parsed page count',async()=>{
  const {container}=render(<DocumentOriginal document={{...doc,mime:'image/png'}} pageCount={12} initialPage={9} onAttach={()=>{}}/>);
  await screen.findByAltText('Lecture, page 1');expect(container.querySelectorAll('.original-page')).toHaveLength(1);
  expect(screen.getByRole('button',{name:'Page'}).textContent).toBe('1 / 1');
});
