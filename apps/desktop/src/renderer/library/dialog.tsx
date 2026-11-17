import { TextInput, Button, Dialog, DialogHeader, DropdownMenu, DropdownMenuItem } from "@astryxdesign/core";
import { Children, cloneElement, isValidElement, useState, useEffect, useRef, type ReactNode } from 'react';
import { tr } from '../../shared/i18n';
function menuItems(children:ReactNode):ReactNode {
 return Children.map(children,child=>{
  if(!isValidElement<{children?:ReactNode;label?:string;icon?:ReactNode;isDisabled?:boolean;onClick?:()=>void}>(child))return child;
  if(child.type===Button)return <DropdownMenuItem icon={child.props.icon} label={child.props.children ?? child.props.label} isDisabled={!!child.props.isDisabled} onClick={() => child.props.onClick?.()} hasCloseOnSelect={false} />;
  return cloneElement(child,{},menuItems(child.props.children));
 });
}
export function LibraryDialog({title,children,onClose,menu=false,anchor}:{title:string;children:ReactNode;onClose:()=>void;menu?:boolean;anchor?:HTMLElement|null}) {
 const [menuOpen,setMenuOpen]=useState(false);
 // Let the originating context-menu gesture finish before opening the native popover.
 useEffect(()=>{if(!menu)return;const frame=requestAnimationFrame(()=>setMenuOpen(true));return()=>cancelAnimationFrame(frame);},[menu]);
 const previous=useRef(document.activeElement as HTMLElement|null);
 const restoreFocus=()=>{const target=previous.current?.isConnected&&previous.current!==document.body?previous.current:anchor?.isConnected?anchor:document.querySelector<HTMLElement>('.library-document[tabindex="0"]')??document.getElementById('shell-content');target?.focus();};
 useEffect(()=>()=>restoreFocus(),[]);
 if(menu){const rect=anchor?.getBoundingClientRect();return <DropdownMenu isMenuOpen={menuOpen} onOpenChange={open=>{if(!open && menuOpen)onClose();}} alignment="end" renderTrigger={props => <button {...props} tabIndex={-1} aria-hidden="true" style={{position:'fixed',left:rect?.left??0,top:rect?.top??0,width:rect?.width??1,height:rect?.height??1,opacity:0,pointerEvents:'none'}} aria-label={title}/>}><div role="region" aria-label={title} className="library-dialog anchored-menu">{menuItems(children)}</div></DropdownMenu>;}
 return <Dialog isOpen width={480} padding={6} onOpenChange={open=>{if(!open)onClose();}} className="library-dialog" aria-label={title}><DialogHeader title={title} onOpenChange={open=>{if(!open)onClose();}} /><div className="library-dialog-body">{children}</div></Dialog>;
}
export function useLibraryPrompt() {
  const [request, setRequest] = useState<{
    title: string;
    value: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const ask = (title: string, value = "") =>
    new Promise<string | null>((resolve) =>
      setRequest({ title, value, resolve }),
    );
  const close = (value: string | null) => {
    request?.resolve(value);
    setRequest(null);
  };
  const dialog = request ? (
    <LibraryDialog title={request.title} onClose={() => close(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close(request.value.trim() || null);
        }}
      >
        <TextInput label={request.title}
            hasAutoFocus
            isRequired
            {...{maxLength: 200}}
            value={request.value}
            onChange={(_value, e) => setRequest({ ...request, value: e.target.value })}
          />
        <Button type="submit" label={tr("library:save")} variant="primary" />
      </form>
    </LibraryDialog>
  ) : null;
  return [ask, dialog] as const;
}
