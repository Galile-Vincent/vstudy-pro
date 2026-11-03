import { app, Menu, BrowserWindow } from 'electron';
import { i18n, systemLanguage, tr } from '../shared/i18n';
import type { Settings } from '../shared';
export function setMainLanguage(language: Settings['language']): void {
  void i18n.changeLanguage(language === 'auto' ? systemLanguage(process.env.VSTUDY_LOCALE ?? app.getLocale()) : language);
}
export function updateApplicationMenu(language: Settings['language']): void {
  setMainLanguage(language);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label:'VStudy Pro', submenu:[{role:'about',label:tr('common:menu_about')},{label:tr('common:open_settings')+'…',accelerator:'CommandOrControl+,',click:()=>BrowserWindow.getFocusedWindow()?.webContents.send('vstudy:open-settings')},{type:'separator'},{role:'services',label:tr('common:menu_services')},{type:'separator'},{role:'hide',label:tr('common:menu_hide')},{role:'hideOthers',label:tr('common:menu_hideOthers')},{role:'unhide',label:tr('common:menu_unhide')},{type:'separator'},{role:'quit',label:tr('common:menu_quit')}] },
    {label:tr('common:file'),submenu:[{role:'close',label:tr('common:menu_close')}]},
    {label:tr('common:edit_menu'),submenu:[{role:'undo',label:tr('common:menu_undo')},{role:'redo',label:tr('common:menu_redo')},{type:'separator'},{role:'cut',label:tr('common:menu_cut')},{role:'copy',label:tr('common:menu_copy')},{role:'paste',label:tr('common:menu_paste')},{role:'selectAll',label:tr('common:menu_selectAll')}]},
    {label:tr('common:view'),submenu:[{role:'resetZoom',label:tr('common:menu_resetZoom')},{role:'zoomIn',label:tr('common:menu_zoomIn')},{role:'zoomOut',label:tr('common:menu_zoomOut')},{role:'togglefullscreen',label:tr('common:menu_togglefullscreen')}]},
    {label:tr('common:window'),submenu:[{role:'minimize',label:tr('common:menu_minimize')},{role:'zoom',label:tr('common:menu_zoom')},{role:'front',label:tr('common:menu_front')}]},
  ]));
}
export { tr };
