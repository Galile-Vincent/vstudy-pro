import { Children, cloneElement, isValidElement, useState, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { tr } from '../../shared/i18n';
function menuItems(children:ReactNode):ReactNode {
 return Children.map(children,child=>{
  if(!isValidElement<{children?:ReactNode}>(child))return child;
  if(child.type===Button)return <DropdownMenuItem asChild className="justify-start" onSelect={event=>event.preventDefault()}>{child}</DropdownMenuItem>;
  return cloneElement(child,{},menuItems(child.props.children));
 });
}
export function LibraryDialog({title,children,onClose,menu=false,anchor}:{title:string;children:ReactNode;onClose:()=>void;menu?:boolean;anchor?:HTMLElement|null}) {
 const previous=useRef(document.activeElement as HTMLElement|null);
 const restoreFocus=()=>{const target=previous.current?.isConnected&&previous.current!==document.body?previous.current:anchor?.isConnected?anchor:document.querySelector<HTMLElement>('.library-document[tabindex="0"]')??document.getElementById('shell-content');target?.focus();};
 useEffect(()=>()=>restoreFocus(),[]);
 const restore=(event:Event)=>{event.preventDefault();restoreFocus();};
 if(menu){const rect=anchor?.getBoundingClientRect();return <DropdownMenu modal={false} open onOpenChange={open=>{if(!open)onClose();}}><DropdownMenuTrigger tabIndex={-1} aria-hidden="true" style={{position:'fixed',left:rect?.left??0,top:rect?.top??0,width:rect?.width??1,height:rect?.height??1,opacity:0,pointerEvents:'none'}} aria-label={title}/><DropdownMenuContent ref={node=>{if(node?.parentElement){node.parentElement.setAttribute("role","region");node.parentElement.setAttribute("aria-label",title);}}} tabIndex={0} className="library-dialog anchored-menu" aria-label={title} onCloseAutoFocus={restore}>{menuItems(children)}</DropdownMenuContent></DropdownMenu>;}
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="settings-dialog library-dialog" aria-describedby={undefined} showCloseButton={false} aria-label={title} onCloseAutoFocus={restore}><div className="dialog-title"><DialogTitle>{title}</DialogTitle><Button variant="ghost" aria-label={tr('library:close')} onClick={onClose}>×</Button></div>{children}</DialogContent></Dialog>;
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
        <label>
          {request.title}
          <Input
            autoFocus
            required
            maxLength={200}
            value={request.value}
            onChange={(e) => setRequest({ ...request, value: e.target.value })}
          />
        </label>
        <Button variant="outline">{tr("library:save")}</Button>
      </form>
    </LibraryDialog>
  ) : null;
  return [ask, dialog] as const;
}
