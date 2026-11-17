// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {hasNavigationOverlay} from './history-swipe-navigation';
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();});
it.each(['<div class="app-tabs-menu" data-state="open"></div>','<div data-slot="popover-content"></div>','<dialog open class="astryx-mobile-nav"></dialog>'])('hides native content for %s',html=>{
 document.body.innerHTML=html;vi.spyOn(Element.prototype,'getClientRects').mockReturnValue([{width:10,height:10}] as unknown as DOMRectList);expect(hasNavigationOverlay()).toBe(true);
 document.body.firstElementChild!.setAttribute('hidden','');expect(hasNavigationOverlay()).toBe(false);
});

it.each(['<div role="listbox"></div>','<div role="menu" style="display:none"></div>','<div data-slot="popover-content" style="width:0;height:0"></div>'])('ignores invisible overlays %s',html=>{
 document.body.innerHTML=html;vi.spyOn(Element.prototype,'getClientRects').mockReturnValue([] as unknown as DOMRectList);expect(hasNavigationOverlay()).toBe(false);
});
