import { app, Menu } from 'electron';
import { i18n, systemLanguage, tr } from '../shared/i18n';
import type { Settings } from '../shared';
export function setMainLanguage(language: Settings['language']): void {
  void i18n.changeLanguage(language === 'auto' ? systemLanguage(process.env.VSTUDY_LOCALE ?? app.getLocale()) : language);
}
export function updateApplicationMenu(language: Settings['language']): void {
  setMainLanguage(language);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label:'VStudy Pro', submenu:[{role:'about'},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}] },
    {label:tr('common:file'),submenu:[{role:'close'}]},
    {label:tr('common:edit_menu'),submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:tr('common:view'),submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
    {label:tr('common:window'),submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]},
  ]));
}
export { tr };
