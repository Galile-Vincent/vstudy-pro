type ReaderPosition = {readerScrollTop?:number|undefined;anchor?:string|undefined;anchorOffset?:number|undefined};
export function captureReaderPosition(element:HTMLElement | null):ReaderPosition {
  if(!element)return {};
  const top=element.getBoundingClientRect().top;
  const blocks=element.querySelectorAll<HTMLElement>('[data-testid="document-markdown"] > *');
  let index=0;
  for(let i=0;i<Math.min(blocks.length,100_000);i++) {
    if(blocks[i]!.getBoundingClientRect().top>top+60)break;
    index=i;
  }
  const block=blocks[index];
  return {readerScrollTop:Math.min(100_000_000,element.scrollTop),...(block?{anchor:String(index),anchorOffset:block.getBoundingClientRect().top-top}:{})};
}
export function restoreReaderPosition(element:HTMLElement,state:ReaderPosition) {
  element.scrollTop=state.readerScrollTop ?? 0;
  if(!state.anchor || !/^\d{1,6}$/.test(state.anchor))return;
  const block=element.querySelectorAll<HTMLElement>('[data-testid="document-markdown"] > *')[Number(state.anchor)];
  if(block)element.scrollTop+=block.getBoundingClientRect().top-element.getBoundingClientRect().top-(state.anchorOffset ?? 0);
}
