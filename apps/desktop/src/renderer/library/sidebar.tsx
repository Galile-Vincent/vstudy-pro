import { useEffect, useState, useRef, type DragEvent } from "react";
import {
  Folder as FolderIcon,
  ChevronRight,
  Pin,
  Plus,
  MoreHorizontal,
  BookOpen,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "../../shared/i18n";
import { desktop } from "../bridge";
import { errorText } from "../status";
import { useNavigate } from "../shell";
import type { LibraryQuery } from "../../shared/library";
import type { IpcResponse } from "../../shared/ipc";
import {
  changed,
  importFiles,
  moveDocuments,
  visibleFolders,
  type Folder,
} from "./model";
import { LibraryDialog, useLibraryPrompt } from "./dialog";
export function LibrarySidebar() {
  useTranslation();
  const [prompt, promptDialog] = useLibraryPrompt();
  const { route, navigate } = useNavigate();
  const [folders, setFolders] = useState<Folder[]>([]),
    [saved, setSaved] = useState<IpcResponse<"library:savedFilters:list">>([]),
    [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("library-expanded") ?? "[]"),
  );
  const [focus, setFocus] = useState(""),
    [menu, setMenu] = useState<Folder | null>(null),
    [editing, setEditing] = useState(""),
    [rename, setRename] = useState(""),
    [over, setOver] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [undo, setUndo] = useState<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 30000);
    return () => clearTimeout(timer);
  }, [undo]);
  const typed = useRef("");
  const typedAt = useRef(0);
  const refresh = () => {
    void Promise.all([
      desktop.invoke("library:tree", {}),
      desktop.invoke("library:savedFilters:list", {}),
      desktop.invoke("library:counts", {}),
    ])
      .then(([f, s, d]) => {
        setFolders(f);
        setSaved(s);
        setCounts(d);
      })
      .catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    refresh();
    window.addEventListener("library-changed", refresh);
    return () => window.removeEventListener("library-changed", refresh);
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      changed();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = current.includes(id)
        ? current.filter((i) => i !== id)
        : [...current, id];
      localStorage.setItem("library-expanded", JSON.stringify(next));
      return next;
    });
  const go = (query: Partial<LibraryQuery>, title: string) =>
    navigate({ view: "library", query, title });
  const drop = async (e: DragEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setOver("");
    await run(async () => {
      const doc = e.dataTransfer.getData("application/vstudy-documents"),
        source = e.dataTransfer.getData("application/vstudy-folder");
      if (doc) {
        await moveDocuments(JSON.parse(doc), folder.id);
        const origins = JSON.parse(
          e.dataTransfer.getData("application/vstudy-origin") || "[]",
        ) as {
          id: import("../../shared").Document["id"];
          folderId: Folder["id"] | null;
        }[];
        if (origins.length)
          setUndo(() => async () => {
            for (const origin of origins)
              await moveDocuments([origin.id], origin.folderId);
            changed();
          });
      } else if (source)
        await desktop.invoke("library:folders:move", {
          folderId: JSON.parse(source),
          parentId: folder.id,
        });
      else await importFiles(folder.id, Array.from(e.dataTransfer.files));
    });
  };
  const pins = folders
    .filter((f) => f.pinned)
    .sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
  const reorderPin = (from: number, to: number) => {
    if (to < 0 || to >= pins.length) return;
    const ids = pins.map((f) => f.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    void run(() =>
      desktop.invoke("library:pins:reorder", { kind: "folders", ids }),
    );
  };
  const visible = visibleFolders(folders, expanded);
  return (
    <>
      <nav className="library-smart" aria-label={tr("library:smartViews")}>
        {(
          ["all", "recent", "pinned", "unfiled", "converting-failed"] as const
        ).map((view) => (
          <button
            key={view}
            aria-current={
              route.view === "library" && route.query?.view === view
                ? "page"
                : undefined
            }
            onClick={() => go({ view }, tr(`library:${view}`))}
          >
            {tr(`library:${view}`)}
            {counts[view] !== undefined && <small>{counts[view]}</small>}
          </button>
        ))}
      </nav>
      <h2 className="sidebar-label">{tr("library:pinnedFolders")}</h2>
      {pins.map((f, index) => (
        <div
          className="folder-pin"
          key={f.id}
          draggable
          onDragStart={(e) =>
            e.dataTransfer.setData("application/vstudy-pin", String(index))
          }
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const source = e.dataTransfer.getData("application/vstudy-pin");
            if (source) reorderPin(Number(source), index);
          }}
        >
          <button onClick={() => go({ folderId: f.id }, f.name)}>
            <Pin />
            {f.name}
          </button>
          <button
            aria-label={tr("library:moveUp", { name: f.name })}
            disabled={index === 0}
            onClick={() => reorderPin(index, index - 1)}
          >
            ↑
          </button>
          <button
            aria-label={tr("library:moveDown", { name: f.name })}
            disabled={index === pins.length - 1}
            onClick={() => reorderPin(index, index + 1)}
          >
            ↓
          </button>
        </div>
      ))}
      <div className="sidebar-label">
        <h2>{tr("library:folders")}</h2>
        <button
          aria-label={tr("library:newFolder")}
          onClick={async () => {
            const name = await prompt(tr("library:newFolder"));
            if (name)
              void run(() =>
                desktop.invoke("library:folders:create", {
                  name,
                  parentId: null,
                }),
              );
          }}
        >
          <Plus />
        </button>
      </div>
      <div role="tree" aria-label={tr("library:folders")}>
        {visible.map(({ folder: f, level }, index) => (
          <div
            key={f.id}
            role="treeitem"
            aria-label={f.name}
            aria-level={level}
            aria-expanded={expanded.includes(f.id)}
            aria-selected={route.query?.folderId === f.id}
            tabIndex={focus === f.id || (!focus && index === 0) ? 0 : -1}
            className="folder-node"
            data-color={f.color}
            data-over={over === f.id}
            style={{
              paddingInlineStart: `calc(var(--space-3) * ${level - 1})`,
            }}
            draggable
            onFocus={() => setFocus(f.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/vstudy-folder",
                JSON.stringify(f.id),
              );
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(f.id);
            }}
            onDragLeave={() => setOver("")}
            onDrop={(e) => void drop(e, f)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                e.preventDefault();
                setMenu(f);
                setRename(f.name);
                return;
              }
              let target = index;
              if (e.key === "ArrowDown")
                target = Math.min(visible.length - 1, index + 1);
              else if (e.key === "ArrowUp") target = Math.max(0, index - 1);
              else if (e.key === "Home") target = 0;
              else if (e.key === "End") target = visible.length - 1;
              else if (e.key === "ArrowRight") {
                if (!expanded.includes(f.id)) toggle(f.id);
              } else if (e.key === "ArrowLeft") {
                if (expanded.includes(f.id)) toggle(f.id);
                else
                  target = visible.findIndex((n) => n.folder.id === f.parentId);
              } else if (e.key === "Enter") go({ folderId: f.id }, f.name);
              else if (e.key === "F2") {
                setEditing(f.id);
                setRename(f.name);
              } else if (e.key.length === 1 && !e.metaKey) {
                typed.current =
                  Date.now() - typedAt.current > 700
                    ? e.key
                    : typed.current + e.key;
                typedAt.current = Date.now();
                target = visible.findIndex((n) =>
                  n.folder.name
                    .toLocaleLowerCase()
                    .startsWith(typed.current.toLocaleLowerCase()),
                );
              } else return;
              e.preventDefault();
              const next = visible[target];
              if (next) {
                setFocus(next.folder.id);
                const nodes =
                  e.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                    "[role=treeitem]",
                  );
                nodes?.[target]?.focus();
              }
            }}
          >
            <button
              tabIndex={-1}
              aria-label={tr("library:expand")}
              onClick={() => toggle(f.id)}
            >
              <ChevronRight
                className={expanded.includes(f.id) ? "expanded" : ""}
              />
            </button>
            {editing === f.id && (
              <input
                aria-label={tr("library:name")}
                autoFocus
                value={rename}
                onChange={(e) => setRename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing("");
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    void run(() =>
                      desktop.invoke("library:folders:update", {
                        folderId: f.id,
                        name: rename,
                      }),
                    );
                    setEditing("");
                  }
                }}
              />
            )}
            <button
              tabIndex={-1}
              onClick={() => go({ folderId: f.id }, f.name)}
            >
              {f.icon === "book" ? (
                <BookOpen />
              ) : f.icon === "star" ? (
                <Star />
              ) : (
                <FolderIcon />
              )}
              {f.name}
              <small>{f.count}</small>
            </button>
            <button
              aria-label={tr("library:folderActions", { name: f.name })}
              tabIndex={-1}
              onClick={async () => {
                setMenu(f);
                setRename(f.name);
              }}
            >
              <MoreHorizontal />
            </button>
          </div>
        ))}
      </div>
      <h2 className="sidebar-label">{tr("library:savedFilters")}</h2>
      {saved.map((s) => (
        <button key={s.id} onClick={() => go(JSON.parse(s.queryJson), s.name)}>
          {s.name}
        </button>
      ))}
      {error && (
        <p role="alert">
          {error}
          <button onClick={refresh}>{tr("library:retry")}</button>
        </p>
      )}
      {menu && (
        <LibraryDialog
          title={tr("library:folderActions", { name: menu.name })}
          onClose={() => setMenu(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                desktop.invoke("library:folders:update", {
                  folderId: menu.id,
                  name: rename,
                }),
              );
              setMenu(null);
            }}
          >
            <label>
              {tr("library:name")}
              <input
                value={rename}
                onChange={(e) => setRename(e.target.value)}
                autoFocus
                required
              />
            </label>
            <button>{tr("library:rename")}</button>
          </form>
          <button
            onClick={() =>
              void run(() =>
                desktop.invoke("library:folders:update", {
                  folderId: menu.id,
                  pinned: !menu.pinned,
                }),
              )
            }
          >
            {tr("library:pin")}
          </button>
          <button
            onClick={async () => {
              const name = await prompt(tr("library:newFolder"));
              if (name)
                void run(() =>
                  desktop.invoke("library:folders:create", {
                    name,
                    parentId: menu.id,
                  }),
                );
            }}
          >
            {tr("library:newSubfolder")}
          </button>
          <label>
            {tr("library:move")}
            <select
              value={menu.parentId ?? ""}
              onChange={(e) =>
                void run(() =>
                  desktop.invoke("library:folders:move", {
                    folderId: menu.id,
                    parentId:
                      folders.find((f) => f.id === e.target.value)?.id ?? null,
                  }),
                )
              }
            >
              <option value="">{tr("library:root")}</option>
              {folders
                .filter((f) => f.id !== menu.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {tr("library:icon")}
            <select
              aria-label={tr("library:icon")}
              value={menu.icon ?? ""}
              onChange={(e) => {
                const icon = e.target.value;
                setMenu({ ...menu, icon });
                void run(() =>
                  desktop.invoke("library:folders:update", {
                    folderId: menu.id,
                    icon,
                  }),
                );
              }}
            >
              {["", "book", "star"].map((icon) => (
                <option key={icon} value={icon}>
                  {tr(`library:icon_${icon || "folder"}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("library:color")}
            <select
              value={menu.color ?? ""}
              onChange={(e) => {
                setMenu({ ...menu, color: e.target.value || null });
                void run(() =>
                  desktop.invoke("library:folders:update", {
                    folderId: menu.id,
                    color: e.target.value || null,
                  }),
                );
              }}
            >
              {["", "sage", "blue", "amber"].map((c) => (
                <option key={c} value={c}>
                  {tr(`library:color_${c || "none"}`)}
                </option>
              ))}
            </select>
          </label>
          {(["parent", "unfiled"] as const).map((destination) => (
            <button
              key={destination}
              onClick={async () => {
                void run(() =>
                  desktop.invoke("library:folders:delete", {
                    folderId: menu.id,
                    destination,
                  }),
                );
                setMenu(null);
              }}
            >
              {tr(`library:deleteFolder_${destination}`)}
            </button>
          ))}
        </LibraryDialog>
      )}
      {undo && (
        <div className="library-toast" role="status">
          {tr("library:moved")}
          <button
            onClick={() =>
              void run(async () => {
                await undo();
                setUndo(null);
              })
            }
          >
            {tr("library:undo")}
          </button>
        </div>
      )}
      {promptDialog}
    </>
  );
}
