// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {hasNavigationOverlay} from './history-swipe-navigation';
afterEach(()=>{document.body.innerHTML='';});
it.each(['<div class="app-tabs-menu" data-state="open"></div>','<div data-slot="popover-content"></div>','<div class="app-shell" data-sidebar-overlay="true"><aside class="shell-sidebar"></aside></div>'])('hides native content for %s',html=>{
 document.body.innerHTML=html;expect(hasNavigationOverlay()).toBe(true);
 document.body.firstElementChild!.setAttribute('hidden','');expect(hasNavigationOverlay()).toBe(false);
});
