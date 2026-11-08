// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { captureReaderPosition, restoreReaderPosition } from './reader-position';
it('restores the visible block offset after preceding content changes height',()=>{
  const pane=document.createElement('section');pane.innerHTML='<div data-testid="document-markdown"><p>First</p><p>Second</p></div>';
  vi.spyOn(pane,'getBoundingClientRect').mockImplementation(()=>({top:100}) as DOMRect);
  const blocks=pane.querySelectorAll('p');let shift=0;
  blocks.forEach((block,index)=>vi.spyOn(block,'getBoundingClientRect').mockImplementation(()=>({top:100+index*800+shift-pane.scrollTop}) as DOMRect));
  pane.scrollTop=900;const saved=captureReaderPosition(pane);
  expect(saved.anchor).toBe('1');expect(saved.anchorOffset).toBe(-100);
  pane.scrollTop=0;shift=100;restoreReaderPosition(pane,saved);
  expect(pane.scrollTop).toBe(1000);
  restoreReaderPosition(pane,{readerScrollTop:200,anchor:'invalid'});expect(pane.scrollTop).toBe(200);
});
