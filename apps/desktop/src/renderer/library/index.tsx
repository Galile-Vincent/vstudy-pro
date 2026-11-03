import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  FileText,
  Search,
  Pin,
  MoreHorizontal,
  LayoutGrid,
  List,
  FolderOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LibraryQuery } from "../../shared/library";
import type { IpcResponse } from "../../shared/ipc";
import { tr } from "../../shared/i18n";
import { desktop } from "../bridge";
import { useFormat } from "../i18n";
import { errorText } from "../status";
import { useNavigate } from "../shell";
import { LibraryDialog, useLibraryPrompt } from "./dialog";
import {
  changed,
  importFiles,
  moveDocuments,
  selectedRange,
  type Item,
  type Folder,
} from "./model";
import "./library.css";
export { LibrarySidebar } from "./sidebar";
const defaults: LibraryQuery = { sort: "manual", direction: "asc", limit: 50 };
export function Snippet({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\[mark\]|\[\/mark\])/)
        .map((part, index, array) =>
          part === "[mark]" || part === "[/mark]" ? null : array[index - 1] ===
            "[mark]" ? (
            <mark key={index}>{part}</mark>
          ) : (
            part
          ),
        )}
    </>
  );
}
export function LibraryView() {
  useTranslation();
  const [prompt, promptDialog] = useLibraryPrompt();
  const { route, navigate } = useNavigate(),
    format = useFormat();
  const viewKey = route.query?.folderId ?? route.query?.view ?? "all";
  const restoreTop = useRef(
    Number(sessionStorage.getItem(`library-scroll:${viewKey}`) ?? 0),
  );
  const [query, setQuery] = useState<LibraryQuery>(() => ({
    ...defaults,
    ...JSON.parse(localStorage.getItem(`library-sort:${viewKey}`) ?? "{}"),
    ...route.query,
  }));
  const [text, setText] = useState(route.query?.text ?? ""),
    [items, setItems] = useState<Item[]>([]),
    [cursor, setCursor] = useState<LibraryQuery["cursor"]>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [progress, setProgress] = useState<
    Record<string, { page: number; total: number }>
  >({});
  useEffect(
    () =>
      desktop.onDocumentProgress?.((event) => {
        const page = Number(event.params?.page),
          total = Number(event.params?.total);
        if (page && total)
          setProgress((p) => ({ ...p, [event.documentId]: { page, total } }));
        if (event.code === "library.conversion_complete") changed();
      }),
    [],
  );
  const [grid, setGrid] = useState(
      () => localStorage.getItem("library-grid") === "true",
    ),
    [top, setTop] = useState(0),
    [selected, setSelected] = useState<Item["document"]["id"][]>([]),
    [menu, setMenu] = useState<Item | null>(null),
    [move, setMove] = useState(false),
    [tagging, setTagging] = useState(false),
    [folders, setFolders] = useState<Folder[]>([]),
    [tags, setTags] = useState<IpcResponse<"library:tags:list">>([]),
    [undo, setUndo] = useState<(() => Promise<void>) | null>(null),
    [notice, setNotice] = useState("");
  const scroller = useRef<HTMLDivElement>(null),
    anchor = useRef(""),
    generation = useRef(0),
    fetching = useRef(false);
  const previousQuery = useRef(JSON.stringify(query));
  const refresh = useCallback(() => {
    setRevision((v) => v + 1);
  }, []);
  useEffect(() => {
    window.addEventListener("library-changed", refresh);
    return () => window.removeEventListener("library-changed", refresh);
  }, [refresh]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((q) =>
          q.text === (text.trim() || undefined)
            ? q
            : { ...q, text: text.trim() || undefined, cursor: undefined },
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (items.some((i) => i.document.status === "converting")) refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [items, refresh]);
  useEffect(() => {
    localStorage.setItem(
      `library-sort:${viewKey}`,
      JSON.stringify({ sort: query.sort, direction: query.direction }),
    );
    const id = ++generation.current;
    fetching.current = false;
    if (previousQuery.current === JSON.stringify(query)) {
      restoreTop.current = scroller.current?.scrollTop ?? restoreTop.current;
    } else {
      restoreTop.current = 0;
      previousQuery.current = JSON.stringify(query);
    }
    setLoading(true);
    setError("");
    setSelected([]);
    void Promise.all([
      desktop.invoke("library:documents:list", { ...query, cursor: undefined }),
      desktop.invoke("library:tree", {}),
      desktop.invoke("library:tags:list", {}),
    ])
      .then(async ([page, f, t]) => {
        if (id !== generation.current) return;
        const rows = page.items;
        const multiplier = grid
          ? Math.max(
              1,
              Math.floor(
                (document.getElementById("shell-content")?.clientWidth ?? 700) /
                  260,
              ),
            )
          : 1;
        while (
          page.nextCursor &&
          (rows.length * 104) / multiplier < restoreTop.current + 800
        ) {
          const next = await desktop.invoke("library:documents:list", {
            ...query,
            cursor: page.nextCursor,
          });
          if (id !== generation.current) return;
          rows.push(...next.items);
          page.nextCursor = next.nextCursor;
        }
        setItems(rows);
        setCursor(page.nextCursor ?? undefined);
        setFolders(f);
        setTags(t);
      })
      .catch((e) => {
        if (id === generation.current) setError(errorText(e));
      })
      .finally(() => {
        if (id === generation.current) setLoading(false);
      });
  }, [query, revision, route.title]);
  useLayoutEffect(() => {
    if (!loading && scroller.current) {
      scroller.current.scrollTop = restoreTop.current;
      setTop(scroller.current.scrollTop);
      restoreTop.current = 0;
    }
  }, [loading]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => {
      setUndo(null);
      setNotice("");
    }, 30000);
    return () => clearTimeout(timer);
  }, [undo]);
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      changed();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const more = async () => {
    if (!cursor || fetching.current) return;
    fetching.current = true;
    const id = generation.current;
    try {
      const page = await desktop.invoke("library:documents:list", {
        ...query,
        cursor,
      });
      if (id === generation.current) {
        setItems((current) => [...current, ...page.items]);
        setCursor(page.nextCursor ?? undefined);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      fetching.current = false;
    }
  };
  const selectAll = async () => {
    let all = items;
    let next = cursor;
    while (next) {
      const page = await desktop.invoke("library:documents:list", {
        ...query,
        cursor: next,
      });
      all = [...all, ...page.items];
      next = page.nextCursor ?? undefined;
    }
    setItems(all);
    setCursor(undefined);
    setSelected(all.map((i) => i.document.id));
  };
  const open = (item: Item) =>
    navigate({
      view: "workspace",
      documentId: item.document.id,
      query: route.query,
      title: route.title,
    });
  const ids =
    menu && !selected.includes(menu.document.id)
      ? [menu.document.id]
      : selected;
  const remove = async (targets: Item["document"]["id"][]) => {
    await run(async () => {
      for (const documentId of targets)
        await desktop.invoke("library:documents:softDelete", { documentId });
      setNotice(
        tr("library:deleted", {
          count: targets.length,
          formatted: format.number(targets.length),
        }),
      );
      setUndo(() => async () => {
        for (const documentId of targets)
          await desktop.invoke("library:documents:restore", { documentId });
        changed();
      });
    });
    setMenu(null);
  };
  const moveTo = async (folderId: Folder["id"] | null) => {
    const previous = items.filter((i) => ids.includes(i.document.id));
    await run(() => moveDocuments(ids, folderId));
    setNotice(tr("library:moved"));
    setUndo(() => async () => {
      for (const i of previous)
        await desktop.invoke("library:documents:move", {
          documentIds: [i.document.id],
          folderId: i.folderId,
        });
      changed();
    });
    setMove(false);
    setMenu(null);
  };
  const reorder = async (item: Item, delta: number) => {
    const index = items.indexOf(item),
      before = items[index + (delta < 0 ? -1 : 2)];
    if (index + delta < 0 || index + delta >= items.length) return;
    await run(() =>
      desktop.invoke("library:documents:move", {
        documentIds: [item.document.id],
        folderId: item.folderId,
        ...(before ? { beforeId: before.document.id } : {}),
      }),
    );
  };
  const filters = Object.entries(query).filter(
    ([key, value]) =>
      !["sort", "direction", "limit", "cursor", "view", "text"].includes(key) &&
      value !== undefined,
  );
  const rowHeight = grid ? 216 : query.text ? 128 : 104,
    columns = grid
      ? Math.max(1, Math.floor((scroller.current?.clientWidth ?? 700) / 260))
      : 1,
    start = Math.max(0, Math.floor(top / rowHeight) - 2) * columns,
    end = Math.min(
      items.length,
      start +
        Math.ceil((scroller.current?.clientHeight ?? 800) / rowHeight + 5) *
          columns,
    );
  return (
    <section
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length)
          void run(() =>
            importFiles(
              query.folderId ?? null,
              Array.from(e.dataTransfer.files),
            ),
          );
      }}
      className="library-view"
      aria-label={tr("common:library")}
    >
      <div className="library-title">
        <div>
          <h1>{route.title ?? tr("common:library")}</h1>
          <p className="muted">{tr("library:subtitle")}</p>
        </div>
        <button
          data-testid="import-document"
          onClick={() => void run(() => importFiles(query.folderId ?? null))}
        >
          {tr("common:import_document")}
        </button>
      </div>
      <div className="library-toolbar">
        <label className="library-search">
          <Search aria-hidden="true" />
          <input
            aria-label={tr("library:search")}
            placeholder={tr("library:search")}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <details className="filter-popover">
          <summary>{tr("library:filters")}</summary>
          <div className="filter-panel">
            {(
              ["type", "status", "converter", "tagId", "folderId"] as const
            ).map((key) => (
              <label key={key}>
                {tr(`library:${key}`)}
                <select
                  aria-label={tr(`library:${key}`)}
                  value={String(query[key] ?? "")}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      [key]: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">{tr("library:any")}</option>
                  {key === "folderId"
                    ? folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))
                    : key === "tagId"
                      ? tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))
                      : (key === "type"
                          ? [
                              "pdf",
                              "word",
                              "excel",
                              "powerpoint",
                              "text",
                              "web",
                              "other",
                            ]
                          : key === "status"
                            ? ["ready", "converting", "failed"]
                            : ["pdf_md", "markitdown"]
                        ).map((v) => (
                          <option key={v} value={v}>
                            {tr(`library:${v}`)}
                          </option>
                        ))}
                </select>
              </label>
            ))}
            {(["subfolders", "hasChats", "pinned"] as const).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={query[key] ?? false}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      [key]: e.target.checked || undefined,
                    }))
                  }
                />
                {tr(`library:${key}`)}
              </label>
            ))}
            {(["addedAfter", "addedBefore", "minSize", "maxSize"] as const).map(
              (key) => (
                <label key={key}>
                  {tr(`library:${key}`)}
                  <input
                    type={key.startsWith("added") ? "date" : "number"}
                    min="0"
                    value={String(query[key] ?? "").slice(
                      0,
                      key.startsWith("added") ? 10 : undefined,
                    )}
                    onChange={(e) =>
                      setQuery((q) => ({
                        ...q,
                        [key]: e.target.value
                          ? key.startsWith("added")
                            ? new Date(e.target.value).toISOString()
                            : Number(e.target.value)
                          : undefined,
                      }))
                    }
                  />
                </label>
              ),
            )}
          </div>
        </details>
        <select
          aria-label={tr("library:sort")}
          value={query.sort}
          onChange={(e) =>
            setQuery((q) => ({
              ...q,
              sort: e.target.value as LibraryQuery["sort"],
            }))
          }
        >
          {["manual", "name", "createdAt", "lastOpenedAt", "size", "type"].map(
            (v) => (
              <option key={v} value={v}>
                {tr(`library:${v}`)}
              </option>
            ),
          )}
        </select>
        <button
          aria-label={tr("library:direction")}
          onClick={() =>
            setQuery((q) => ({
              ...q,
              direction: q.direction === "asc" ? "desc" : "asc",
            }))
          }
        >
          {query.direction === "asc" ? "↑" : "↓"}
        </button>
        <button
          aria-label={tr("library:viewToggle")}
          aria-pressed={grid}
          onClick={() =>
            setGrid((v) => {
              localStorage.setItem("library-grid", String(!v));
              return !v;
            })
          }
        >
          {grid ? <List /> : <LayoutGrid />}
        </button>
      </div>
      <div className="filter-chips">
        {filters.map(([key, value]) => (
          <button
            key={key}
            onClick={() => setQuery((q) => ({ ...q, [key]: undefined }))}
          >
            {tr(`library:${key}`)}:{" "}
            {typeof value === "boolean"
              ? tr("library:yes")
              : (folders.find((f) => f.id === value)?.name ??
                tags.find((t) => t.id === value)?.name ??
                String(value))}{" "}
            ×
          </button>
        ))}
        {filters.length > 0 && (
          <>
            <button onClick={() => setQuery({ ...defaults, ...route.query })}>
              {tr("library:clearFilters")}
            </button>
            <button
              onClick={async () => {
                const name = await prompt(tr("library:saveFilter"));
                if (name)
                  void run(() =>
                    desktop.invoke("library:savedFilters:save", {
                      name,
                      query,
                      position: 0,
                    }),
                  );
              }}
            >
              {tr("library:saveFilter")}
            </button>
          </>
        )}
      </div>
      {selected.length > 0 && (
        <div className="bulk-bar">
          <span role="status">
            {tr("library:selected", {
              count: selected.length,
              formatted: format.number(selected.length),
            })}
          </span>
          <button
            onClick={async () => {
              setMenu(null);
              setMove(true);
            }}
          >
            {tr("library:move")}
          </button>
          <button
            onClick={() =>
              void run(async () => {
                for (const documentId of selected)
                  await desktop.invoke("library:documents:pin", {
                    documentId,
                    pinned: true,
                  });
              })
            }
          >
            {tr("library:pin")}
          </button>
          <button onClick={() => void remove(selected)}>
            {tr("library:delete")}
          </button>
          <button onClick={() => setSelected([])}>
            {tr("library:clearSelection")}
          </button>
        </div>
      )}
      {error ? (
        <div className="empty" role="alert">
          <h2>{tr("library:error")}</h2>
          <p>{error}</p>
          <button onClick={refresh}>{tr("library:retry")}</button>
        </div>
      ) : loading ? (
        <div
          className="library-skeleton"
          role="status"
          aria-label={tr("library:loading")}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      ) : !items.length ? (
        <div className="empty library-empty">
          <FolderOpen aria-hidden="true" />
          <h2>
            {tr(
              `library:empty_${text ? "search" : filters.length ? "filter" : query.folderId ? "folder" : "library"}`,
            )}
          </h2>
          <p>{tr("library:emptyHint")}</p>
          <button
            onClick={() =>
              text
                ? setText("")
                : filters.length
                  ? setQuery(defaults)
                  : void run(() => importFiles(query.folderId ?? null))
            }
          >
            {tr(
              text
                ? "library:clearSearch"
                : filters.length
                  ? "library:clearFilters"
                  : "common:import_document",
            )}
          </button>
        </div>
      ) : (
        <div
          ref={scroller}
          className="library-results"
          data-view={grid ? "grid" : "list"}
          role="grid"
          aria-colcount={1}
          aria-rowcount={items.length}
          aria-label={tr("library:documents")}
          aria-multiselectable="true"
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget;
            setTop(el.scrollTop);
            sessionStorage.setItem(
              `library-scroll:${viewKey}`,
              String(el.scrollTop),
            );
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600)
              void more();
          }}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files.length)
              void run(() =>
                importFiles(
                  query.folderId ?? null,
                  Array.from(e.dataTransfer.files),
                ),
              );
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "a") {
              e.preventDefault();
              void selectAll().catch((e) => setError(errorText(e)));
            }
            if (e.key === "Escape") setSelected([]);
          }}
        >
          <div
            style={{
              height: Math.ceil(items.length / columns) * rowHeight,
              position: "relative",
            }}
          >
            {items.slice(start, end).map((item, offset) => {
              const d = item.document,
                index = start + offset;
              return (
                <article
                  key={d.id}
                  data-index={index}
                  role="row"
                  aria-rowindex={index + 1}
                  aria-selected={selected.includes(d.id)}
                  tabIndex={0}
                  className={`library-document ${grid ? "document-card" : ""}`}
                  style={{
                    height: grid
                      ? "calc(var(--library-card-height) - var(--space-3))"
                      : rowHeight,
                    position: "absolute",
                    top: Math.floor(index / columns) * rowHeight,
                    left: `${((index % columns) * 100) / columns}%`,
                    width: grid
                      ? `calc(${100 / columns}% - var(--space-3))`
                      : `${100 / columns}%`,
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/vstudy-origin",
                      JSON.stringify(
                        items
                          .filter((i) =>
                            (selected.includes(d.id)
                              ? selected
                              : [d.id]
                            ).includes(i.document.id),
                          )
                          .map((i) => ({
                            id: i.document.id,
                            folderId: i.folderId,
                          })),
                      ),
                    );
                    e.dataTransfer.setData(
                      "application/vstudy-documents",
                      JSON.stringify(
                        selected.includes(d.id) ? selected : [d.id],
                      ),
                    );
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const payload = e.dataTransfer.getData(
                      "application/vstudy-documents",
                    );
                    if (!payload) return;
                    e.preventDefault();
                    e.stopPropagation();
                    void run(() =>
                      desktop.invoke("library:documents:move", {
                        documentIds: JSON.parse(payload),
                        folderId: item.folderId,
                        beforeId: d.id,
                      }),
                    );
                  }}
                  onClick={(e) => {
                    if (
                      (e.target as HTMLElement).closest("button,input,summary")
                    )
                      return;
                    setSelected((current) =>
                      e.shiftKey
                        ? selectedRange(items, anchor.current, d.id)
                        : e.metaKey || e.ctrlKey
                          ? current.includes(d.id)
                            ? current.filter((id) => id !== d.id)
                            : [...current, d.id]
                          : [d.id],
                    );
                    if (!e.shiftKey) anchor.current = d.id;
                  }}
                  onDoubleClick={() => open(item)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu(item);
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (
                      ["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key) &&
                      !e.altKey &&
                      !e.metaKey &&
                      !e.ctrlKey
                    ) {
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? items.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  items.length - 1,
                                  index + (e.key === "ArrowUp" ? -1 : 1),
                                ),
                              );
                      if (scroller.current) {
                        scroller.current.scrollTop =
                          Math.floor(next / columns) * rowHeight;
                        setTop(scroller.current.scrollTop);
                        requestAnimationFrame(() =>
                          scroller.current
                            ?.querySelector<HTMLElement>(
                              `[data-index="${next}"]`,
                            )
                            ?.focus(),
                        );
                      }
                      return;
                    }
                    if (e.key === "Enter") open(item);
                    if (e.key === " ") {
                      e.preventDefault();
                      setSelected([d.id]);
                    }
                    if (
                      e.key === "ContextMenu" ||
                      (e.shiftKey && e.key === "F10")
                    ) {
                      e.preventDefault();
                      setMenu(item);
                    }
                    if (
                      (e.metaKey || e.ctrlKey) &&
                      e.altKey &&
                      ["ArrowUp", "ArrowDown"].includes(e.key)
                    ) {
                      e.preventDefault();
                      void reorder(item, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                >
                  <div role="gridcell" className="document-cell">
                    <FileText className="document-glyph" aria-hidden="true" />
                    <div className="document-info">
                      <button
                        className="document-title"
                        onClick={() => open(item)}
                      >
                        {d.title}
                      </button>
                      <div className="document-meta">
                        <span>
                          {folders.find((f) => f.id === item.folderId)?.name ??
                            tr("library:unfiled")}
                        </span>
                        <span>
                          {format.number(item.sizeBytes)} {tr("library:bytes")}
                        </span>
                        <span>
                          {tr("library:convertedFrom", {
                            name: d.sourceName,
                            converter: d.converter,
                          })}
                        </span>
                        <span className="status-badge">
                          {tr(`library:${d.status}`)}
                        </span>
                      </div>
                      {item.snippet && (
                        <p className="search-snippet">
                          <Snippet text={item.snippet ?? ""} />
                        </p>
                      )}
                      <div className="document-forms">
                        {item.tags?.map((t) => (
                          <span className="tag-chip" key={t.id}>
                            {t.name}
                          </span>
                        ))}
                        <button onClick={() => open(item)}>
                          {tr("library:markdown")}
                        </button>
                        <button
                          onClick={() =>
                            void run(() =>
                              desktop.invoke("library:openOriginal", {
                                documentId: d.id,
                              }),
                            )
                          }
                        >
                          {tr("library:original")}
                        </button>
                        {d.status === "failed" && (
                          <button
                            onClick={() =>
                              void run(() =>
                                desktop.invoke("documents:retry", {
                                  documentId: d.id,
                                }),
                              )
                            }
                          >
                            {tr("library:retry")}
                          </button>
                        )}
                        {d.status === "converting" && (
                          <progress
                            value={progress[d.id]?.page}
                            max={progress[d.id]?.total}
                            aria-label={tr("common:conversion_progress")}
                          />
                        )}
                      </div>
                    </div>
                    <button
                      aria-label={tr("library:pin")}
                      aria-pressed={item.pinned}
                      onClick={() =>
                        void run(() =>
                          desktop.invoke("library:documents:pin", {
                            documentId: d.id,
                            pinned: !item.pinned,
                          }),
                        )
                      }
                    >
                      <Pin />
                    </button>
                    <button
                      aria-label={tr("library:actions", { name: d.title })}
                      onClick={() => setMenu(item)}
                    >
                      <MoreHorizontal />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {cursor && (
            <button className="load-more" onClick={() => void more()}>
              {tr("library:loadMore")}
            </button>
          )}
        </div>
      )}
      <div className="library-live" aria-live="polite">
        {tr("library:loaded", {
          count: items.length,
          formatted: format.number(items.length),
        })}
      </div>
      {notice && (
        <div className="library-toast" role="status">
          {notice}
          {undo && (
            <button
              onClick={() =>
                void run(async () => {
                  await undo();
                  setUndo(null);
                  setNotice("");
                })
              }
            >
              {tr("library:undo")}
            </button>
          )}
        </div>
      )}
      {menu && !move && !tagging && (
        <LibraryDialog
          title={tr("library:actions", { name: menu.document.title })}
          onClose={() => setMenu(null)}
        >
          <div className="document-menu">
            <button onClick={() => open(menu)}>{tr("library:open")}</button>
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
              {tr("library:rename")}
            </button>
            <button onClick={() => setMove(true)}>{tr("library:move")}</button>
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
              {tr("library:tag")}
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
                {tr(`library:${channel.split(":")[1]}`)}
              </button>
            ))}
            <button
              onClick={() => void remove(ids.length ? ids : [menu.document.id])}
            >
              {tr("library:delete")}
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
      {promptDialog}
    </section>
  );
}
