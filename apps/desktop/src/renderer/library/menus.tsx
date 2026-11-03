import { FileText,Pencil,FolderInput,Tag,ExternalLink,Download,RefreshCw,Trash2 } from 'lucide-react';
import { tr } from '../../shared/i18n';
import { desktop } from '../bridge';
import { LibraryDialog } from './dialog';
import type { Item,Folder } from './model';
export function LibraryMenus({menu,move,tagging,anchor,items,folders,tags,ids,prompt,run,remove,moveTo,open,setMenu,setMove,setTagging}: {
 menu: Item|null; move:boolean;tagging:boolean;anchor:HTMLElement|null;items:Item[];folders:Folder[];tags:Item['tags'];ids:Item['document']['id'][];
 prompt:(title:string,initial?:string)=>Promise<string|null>;
 run:(action:()=>Promise<unknown>)=>Promise<void>;
 remove:(ids:Item['document']['id'][])=>Promise<void>;
 moveTo:(id:Folder['id']|null)=>Promise<void>;
 open:(item:Item)=>void;
 setMenu:(item:Item|null)=>void;setMove:(value:boolean)=>void;setTagging:(value:boolean)=>void;
}) {
 return <>
      {menu && !move && !tagging && (
        <LibraryDialog
          title={tr("library:actions", { name: menu.document.title })}
          menu anchor={anchor}
          onClose={() => setMenu(null)}
        >
          <div className="document-menu">
            <button onClick={() => open(menu)}><FileText/>{tr("library:open")}</button>
            <button
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
              <Pencil/>{tr("library:rename")}
            </button>
            <button onClick={() => setMove(true)}><FolderInput/>{tr("library:move")}</button>
            <button
              onClick={() =>
                void run(() =>
                  desktop.invoke("library:documents:pin", {
                    documentId: menu.document.id,
                    pinned: !menu.pinned,
                  }),
                )
              }
            >
              {tr("library:pin")}
            </button>
            <button onClick={() => setTagging(true)}>
              <Tag/>{tr("library:tag")}
            </button>
            {(
              [
                "library:reveal",
                "library:exportMarkdown",
                "library:exportOriginal",
                "documents:reconvert",
              ] as const
            ).map((channel) => (
              <button
                key={channel}
                onClick={() =>
                  void run(() =>
                    desktop.invoke(channel, { documentId: menu.document.id }),
                  )
                }
              >
                {channel === "documents:reconvert" ? <RefreshCw/> : channel === "library:reveal" ? <ExternalLink/> : <Download/>}{tr(`library:${channel.split(":")[1]}`)}
              </button>
            ))}
            <button
              onClick={() => void remove(ids.length ? ids : [menu.document.id])}
            >
              <Trash2/>{tr("library:delete")}
            </button>
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
          <div className="folder-picker">
            <button onClick={() => void moveTo(null)}>
              {tr("library:unfiled")}
            </button>
            {folders.map((f) => (
              <button key={f.id} onClick={() => void moveTo(f.id)}>
                {f.name}
              </button>
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
            {tags.map((tag) => (
              <label key={tag.id}>
                <input
                  type="checkbox"
                  checked={
                    items
                      .find((i) => i.document.id === menu.document.id)
                      ?.tags.some((t) => t.id === tag.id) ?? false
                  }
                  onChange={(e) =>
                    void run(() =>
                      desktop.invoke("library:documents:tag", {
                        documentId: menu.document.id,
                        tagId: tag.id,
                        assigned: e.target.checked,
                      }),
                    )
                  }
                />
                {tag.name}
              </label>
            ))}
            <button
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
            </button>
          </div>
        </LibraryDialog>
      )}
 </>;
}
