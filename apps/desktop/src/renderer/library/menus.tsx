import { Button } from "@astryxdesign/core";
import { useNavigate } from '../shell';
import { useState } from 'react';
import { useFormat } from '../i18n';
import { CheckboxInput } from "@astryxdesign/core";
import { FileText,Pencil,FolderInput,Tag,ExternalLink,Download,RefreshCw,Trash2,Pin,PinOff,Sparkles,Info } from 'lucide-react';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { LibraryDialog } from './dialog';
import type { Item,Folder } from './model';
export function LibraryMenus({busy,moveNotice,menu,move,tagging,anchor,items,folders,tags,ids,prompt,run,remove,moveTo,open,setMenu,setMove,setTagging}: {
 busy: boolean; moveNotice: string;
 menu: Item|null; move:boolean;tagging:boolean;anchor:HTMLElement|null;items:Item[];folders:Folder[];tags:Item['tags'];ids:Item['document']['id'][];
 prompt:(title:string,initial?:string)=>Promise<string|null>;
 run:(action:()=>Promise<unknown>)=>Promise<void>;
 remove:(ids:Item['document']['id'][])=>Promise<void>;
 moveTo:(id:Folder['id']|null)=>Promise<void>;
 open:(item:Item)=>void;
 setMenu:(item:Item|null)=>void;setMove:(value:boolean)=>void;setTagging:(value:boolean)=>void;
}) {
 const {navigate,openTab} = useNavigate();
 const [details,setDetails]=useState<Item|null>(null);const format=useFormat();
 const path=(id:Item['folderId'])=>{const names:string[]=[];for(let n=0;id&&n<folders.length;n++){const folder=folders.find(f=>f.id===id);if(!folder)break;names.unshift(folder.name);id=folder.parentId;}return names.join(' › ')||tr('library:unfiled');};
 return <>
 {details&&<LibraryDialog title={tr('library:details')} onClose={()=>setDetails(null)}><dl className="document-details">{[
 [tr('library:name'),details.document.title],
 [tr('library:folderId'),path(details.folderId)],
 [tr('library:type'),details.document.sourceName.split('.').pop()?.toUpperCase()],
 [tr('library:size'),details.sizeBytes===null?tr('library:unknown_size'):new Intl.NumberFormat(document.documentElement.lang,{style:'unit',unit:'kilobyte',unitDisplay:'short',maximumFractionDigits:1}).format(details.sizeBytes/1000)],
 [tr('library:createdAt'),format.date(details.document.createdAt)],
 [tr('library:tag'),details.tags.map(t=>t.name).join(', ')],
 ...(details.pageCount===null?[]:[[tr('library:pageCount'),format.number(details.pageCount)]]),
 ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></LibraryDialog>}

      {menu && !move && !tagging && (
        <LibraryDialog
          title={tr("library:actions", { name: menu.document.title })}
          menu anchor={anchor}
          onClose={() => setMenu(null)}
        >
          <div className="document-menu"><h3>{tr("library:details")}</h3>
            <Button icon={<Info/>} label={(tr('library:viewDetails'))} variant="ghost" data-testid="document-details" onClick={()=>{setDetails(menu);setMenu(null);}}>{tr('library:viewDetails')}</Button>
            <Button icon={<FileText/>} label={(tr("tabs:open"))} variant="ghost" onClick={() => {openTab({view:"workspace",documentId:menu.document.id,title:menu.document.title});setMenu(null);}}>{tr("tabs:open")}</Button>
            <Button icon={<FileText/>} label={(tr("library:open"))} variant="ghost" onClick={() => open(menu)}>{tr("library:open")}</Button>
            <Button icon={<FileText/>} label={(tr('library:openReader'))} variant="ghost" onClick={() => {navigate({view:'workspace',documentId:menu.document.id});setMenu(null);}}>{tr('library:openReader')}</Button>
            <Button icon={<ExternalLink/>} label={(tr('library:openOriginal'))} variant="ghost" onClick={() => void run(() => desktop.invoke('library:openOriginal',{documentId:menu.document.id}))}>{tr('library:openOriginal')}</Button>
            <Button icon={<Pencil/>} label={(tr("library:rename"))} variant="ghost"
              onClick={async () => {
                const title = await prompt(
                  tr("library:rename"),
                  menu.document.title,
                );
                if (title)
                  void run(() =>
                    desktop.invoke("library:documents:rename", {
                      documentId: menu.document.id,
                      title,
                    }),
                  );
                setMenu(null);
              }}
            >
              {tr("library:rename")}
            </Button>
            <Button icon={<FolderInput/>} label={(tr("library:move"))} variant="ghost" onClick={() => setMove(true)}>{tr("library:move")}</Button>
            <Button icon={menu.pinned?<PinOff/>:<Pin/>} label={(tr(menu.pinned ? "library:unpin" : "library:pin"))} variant="ghost"
              onClick={() =>
                void run(() =>
                  desktop.invoke("library:documents:pin", {
                    documentId: menu.document.id,
                    pinned: !menu.pinned,
                  }),
                )
              }
            >
              {tr(menu.pinned ? "library:unpin" : "library:pin")}
            </Button>
            <Button icon={<Tag/>} label={(tr("library:tag"))} variant="ghost" onClick={() => setTagging(true)}>
              {tr("library:tag")}
            </Button>
            {(
              [
                "library:reveal",
                "library:exportMarkdown",
                "library:exportOriginal",
                "documents:reconvert",
              ] as const
            ).map((channel) => (
              <Button icon={channel === "documents:reconvert" ? <RefreshCw/> : channel === "library:reveal" ? <ExternalLink/> : <Download/>} label={(tr(`library:${channel.split(":")[1]}`))} variant="ghost"
                key={channel}
                onClick={() =>
                  void run(() =>
                    desktop.invoke(channel, { documentId: menu.document.id }),
                  )
                }
              >
                {tr(`library:${channel.split(":")[1]}`)}
              </Button>
            ))}
            <Button icon={<Sparkles/>} label={(tr('library:ai_parse.reparse'))} variant="ghost" onClick={()=>{navigate({view:'workspace',documentId:menu.document.id,aiParse:true});setMenu(null);}}>{tr('library:ai_parse.reparse')}</Button>
            <Button icon={<Trash2/>} label={(tr("library:delete"))} variant="ghost"
               isDisabled={busy} onClick={() => void remove(ids.length ? ids : [menu.document.id])}
            >
              {tr("library:delete")}
            </Button>
          </div>
        </LibraryDialog>
      )}
      {move && (
        <LibraryDialog
          title={tr("library:move")}
          onClose={() => {
            setMove(false);
            setMenu(null);
          }}
        >
          {moveNotice && <p>{moveNotice}</p>}
          <div className="folder-picker">
            <Button label={(tr("library:unfiled"))} variant="ghost"  isDisabled={busy} onClick={() => void moveTo(null)}>
              {tr("library:unfiled")}
            </Button>
            {folders.map((f) => (
              <Button label={(path(f.id))} variant="ghost" key={f.id}  isDisabled={busy} onClick={() => void moveTo(f.id)}>
                {path(f.id)}
              </Button>
            ))}
          </div>
        </LibraryDialog>
      )}
      {menu && tagging && (
        <LibraryDialog
          title={tr("library:tag")}
          onClose={() => {
            setTagging(false);
            setMenu(null);
          }}
        >
          <div className="folder-picker">
            <p>{tr('library:tag_hint')}</p>{tags.map((tag) => (
              <CheckboxInput key={tag.id} label={tag.name}
                  value={
                    items
                      .find((i) => i.document.id === menu.document.id)
                      ?.tags.some((t) => t.id === tag.id) ?? false
                  }
                  onChange={(checked) =>
                    void run(() =>
                      desktop.invoke("library:documents:tag", {
                        documentId: menu.document.id,
                        tagId: tag.id,
                        assigned: checked,
                      }),
                    )
                  }
                />
            ))}
            <Button label={(tr("library:newTag"))} variant="ghost"
              onClick={async () => {
                const name = await prompt(tr("library:tag"));
                if (name)
                  void run(async () => {
                    const tag =
                      tags.find(
                        (t) =>
                          t.name.toLocaleLowerCase() ===
                          name.toLocaleLowerCase(),
                      ) ??
                      (await desktop.invoke("library:tags:save", {
                        name,
                        color: null,
                      }));
                    await desktop.invoke("library:documents:tag", {
                      documentId: menu.document.id,
                      tagId: tag.id,
                      assigned: true,
                    });
                  });
              }}
            >
              {tr("library:newTag")}
            </Button>
          </div>
        </LibraryDialog>
      )}
 </>;
}
