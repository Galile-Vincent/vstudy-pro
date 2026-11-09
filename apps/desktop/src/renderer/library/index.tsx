import { recovery } from "./recovery";
import { openDocument } from '../document-open';
import { Brand } from '../components/brand';
import { DocumentArt } from '../shell/document-art';
import type { CSSProperties } from 'react';
import { Badge } from '../components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip';
import './ui3.css';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Checkbox } from '../components/checkbox';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { contentLanguage } from "../../shared/content-language";
import { Select } from "../components/select";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FileText,
  Search,
  Pin,
  MoreHorizontal,
  LayoutGrid,
  List,
  SlidersHorizontal, AlertTriangle, LoaderCircle, X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { libraryQuerySchema, type LibraryQuery } from "../../shared/library";
import type { IpcResponse } from "../../shared/ipc";
import { tr } from "../../shared/i18n";
import { desktop } from "../bridge";
import { useFormat } from "../i18n";
import { errorText } from "../status";
import { useNavigate } from "../shell";
import { LibraryMenus } from "./menus";
import { useLibraryPrompt } from "./dialog";
import {
  changed,
  reorderDestination,
  importFiles,
  selectedRange,
  courseName,
  groupByCourse,
  readMode,
  writeMode,
  uncategorizedKey,
  type Item,
  type Folder,
  type LibraryMode,
} from "./model";
import { FolderCrumbs, FolderGrid, LibraryModeToggle } from "./folders";
import "./library.css";
import "./library-surface.css";
export { LibrarySidebar } from "./sidebar";
function folderPath(folders: Folder[], id: string | null | undefined) {
  const names: string[] = [];
  for (let level = 0; id && level < 8; level++) { const folder = folders.find(f => f.id === id); if (!folder) break; names.unshift(folder.name); id = folder.parentId; }
  return names.join(' › ');
}
export function formatSize(bytes: number | null, locale: string) {
    if (bytes === null) return tr("library:unknown_size");
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  const exponent = Math.min(3, Math.max(0, Math.floor(Math.log10(Math.max(1, bytes)) / 3)));
  return new Intl.NumberFormat(locale, { style: 'unit', unitDisplay:'long', unit: units[exponent], maximumFractionDigits: 1 }).format(bytes / 1000 ** exponent);
}
function DocumentTitle({title,details,onOpen}:{title:string;details:string;onOpen:(event: React.MouseEvent<HTMLButtonElement>)=>void}) {
 const ref=useRef<HTMLButtonElement>(null);const [visible,setVisible]=useState(false);
 return <Tooltip delayDuration={500} open={visible} onOpenChange={next=>{const button=ref.current;const hidden=button?.closest('.library-document')?.querySelectorAll(':scope > div');setVisible(next&&!!button&&(button.scrollWidth>button.clientWidth||Array.from(hidden??[]).some(e=>getComputedStyle(e).display==='none')));}}><TooltipTrigger asChild><Button ref={ref} variant="ghost" className="document-title" tabIndex={-1} lang={contentLanguage(title)} onAuxClick={event=>{if(event.button===1){event.preventDefault();onOpen(event);}}} onClick={onOpen}>{title}</Button></TooltipTrigger><TooltipContent className="document-tooltip"><div>{title}</div><div>{details}</div></TooltipContent></Tooltip>;
}
const defaults: LibraryQuery = { sort: "manual", direction: "asc", limit: 50 };
const compactQuery = "(max-width: 1099px)";
function useCompactToolbar() {
  return useSyncExternalStore(
    (change) => {
      if (typeof matchMedia !== "function") return () => {};
      const query = matchMedia(compactQuery);
      query.addEventListener("change", change);
      return () => query.removeEventListener("change", change);
    },
    () => typeof matchMedia === "function" && matchMedia(compactQuery).matches,
    () => false,
  );
}
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
  const { route, navigate, openTab } = useNavigate(),
    format = useFormat();
  const viewKey = route.query?.folderId ?? route.query?.view ?? "all";
  const restoreTop = useRef(
    Number(sessionStorage.getItem(`library-scroll:${viewKey}`) ?? 0),
  );
  const [query, setQuery] = useState<LibraryQuery>(() => {
    let sort = {};
    try { sort = libraryQuerySchema.pick({sort:true,direction:true}).partial().parse(JSON.parse(localStorage.getItem(`library-sort:${viewKey}`) ?? '{}')); }
    catch { /* Corrupt optional sort preferences must not prevent opening the library. */ }
    return {...defaults, ...sort, ...route.query};
  });
  const clearFilters = () => {
    setCustomDates(false);
    setQuery(q => ({
      ...defaults, sort: q.sort, direction: q.direction,
      view: q.view, folderId: q.folderId, subfolders: q.subfolders,
      text: text.trim() || undefined,
    }));
  };
  const [customDates,setCustomDates] = useState(false);
  const [filtersOpen,setFiltersOpen] = useState(false);
  const compactToolbar = useCompactToolbar();
  useEffect(() => {
    if (filtersOpen) document.querySelector<HTMLElement>('.filter-panel input,.filter-panel button')?.focus();
  }, [filtersOpen]);
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
    [notice, setNotice] = useState("");
  const menuAnchor = useRef<HTMLElement | null>(null);
  const placeOf = (item: Item) => courseName(item, language) ?? (folderPath(folders, item.folderId) || tr("library:unfiled"));
  const scroller = useRef<HTMLDivElement>(null),
    anchor = useRef(""),
    generation = useRef(0),
    fetching = useRef(false);
  const previousQuery = useRef(JSON.stringify(query));
  const language = document.documentElement.lang;
  const filters = Object.entries(query).filter(
    ([key, value]) =>
      !["sort", "direction", "limit", "cursor", "view", "text", "folderId", "subfolders"].includes(key) &&
      value !== undefined,
  );
  const [mode, setModeState] = useState<LibraryMode>(readMode);
  const [openKey, setOpenKey] = useState<string | null>(() => {
    try { return sessionStorage.getItem(`library-folder:${viewKey}`); } catch { return null; }
  });
  const groupedView = mode === "folders" && viewKey === "all" && !query.text && !filters.length && !query.folderId;
  const groups = useMemo(() => groupByCourse(items, language), [items, language]);
  const openGroup = groupedView && openKey ? groups.find((g) => g.key === openKey) : undefined;
  const showFolders = groupedView && !openGroup;
  const shown = groupedView ? (openGroup?.items ?? []) : items;
  const selectFolder = (key: string | null) => {
    setOpenKey(key);
    setActiveRow(undefined);
    setSelected([]);
    restoreTop.current = 0;
    try { if (key) sessionStorage.setItem(`library-folder:${viewKey}`, key); else sessionStorage.removeItem(`library-folder:${viewKey}`); }
    catch { /* A blocked session store only loses the reopened folder. */ }
  };
  const chooseMode = (next: LibraryMode) => {
    writeMode(next);
    setModeState(next);
    selectFolder(null);
  };
  useEffect(() => {
    if (openKey && !loading && !cursor && groupedView && !groups.some((g) => g.key === openKey)) selectFolder(null);
  }, [openKey, loading, cursor, groupedView, groups]);
  useEffect(() => {
    if (groupedView && cursor && !loading) void more();
  }, [groupedView, cursor, loading, items.length]);
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
      150,
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
          (rows.length * 64) / multiplier < restoreTop.current + 800
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
  const recoveries = useSyncExternalStore(recovery.subscribe, recovery.snapshot);
  const recoveryNotice = recoveries.at(-1)?.message ?? "";
  const focusAfter = useRef<string | null>(null);
  const [activeRow, setActiveRow] = useState<string>();
  const tabRow = shown.some(item => item.document.id === activeRow) ? activeRow : shown[0]?.document.id;
  useLayoutEffect(() => {
    if (!loading && focusAfter.current) {
      const target = document.getElementById(focusAfter.current);
      (target ?? scroller.current ?? document.getElementById("shell-content"))?.focus();
      focusAfter.current = null;
    }
  }, [loading, items]);
  const run = async (action: () => Promise<unknown>) => {
    const focused = document.activeElement as HTMLElement | null;
    focusAfter.current = focused?.closest<HTMLElement>("[data-index]")?.id ?? menuAnchor.current?.closest<HTMLElement>("[data-index]")?.id ?? "shell-content";
    try {
      await action();
    } catch (e) {
      setNotice(errorText(e));
    } finally { changed(); }
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
    const id = generation.current;
    let all = items;
    let next = cursor;
    try {
      while (next) {
        const page = await desktop.invoke("library:documents:list", { ...query, cursor: next });
        if (id !== generation.current) return;
        all = [...all, ...page.items];
        next = page.nextCursor ?? undefined;
      }
    } catch (error) {
      if (id === generation.current) throw error;
      return;
    }
    setItems(all);
    setCursor(undefined);
    setSelected((openGroup ? all.filter((i) => (i.course?.id ?? uncategorizedKey) === openGroup.key) : all).map((i) => i.document.id));
  };
  const open = (item: Item, newTab = false) => {
    void run(() => openDocument(item.document.id, () => (newTab ? openTab : navigate)({
      view: "workspace",
      documentId: item.document.id,
      query: route.query,
      title: newTab ? item.document.title : route.title,
    })));
  };
  const ids =
    menu && !selected.includes(menu.document.id)
      ? [menu.document.id]
      : selected;
  const remove = async (targets: Item["document"]["id"][]) => {
    await run(async () => {
      const failures: string[] = [];
      let deleted = 0;
      for (const documentId of targets) {
        const deadline = Date.now() + 30000;
        try {
          await desktop.invoke("library:documents:softDelete", { documentId });
          deleted++;
          recovery.add(tr("library:deleted", { count: 1, formatted: format.number(1) }),
            async () => {
              await desktop.invoke("library:documents:restore", { documentId });
              changed();
            }, deadline);
        } catch (error) {
          const title = items.find(item => item.document.id === documentId)?.document.title ?? documentId;
          failures.push(`${title}: ${errorText(error)}`);
        }
      }
      setNotice(failures.length ? tr("library:deletePartial", {
        succeeded: format.number(deleted), total: format.number(targets.length),
        failed: format.number(failures.length), reasons: failures.join("; "),
      }) : "");
    });
    setMenu(null);
  };
  const moveItems = useRef<Item[]>([]);
  const openMove = (value: boolean) => {
    if (value) moveItems.current = items.filter(item => ids.includes(item.document.id));
    setMove(value);
  };
  const moveTo = async (folderId: Folder["id"] | null) => {
    const targets = moveItems.current;
    const failures: string[] = [];
    const remaining: Item[] = [];
    let moved = 0;
    for (const item of targets) {
      try {
        await desktop.invoke("library:documents:move", {
          documentIds: [item.document.id], folderId,
        });
        moved++;
        recovery.add(tr("library:moved"), async () => {
          await desktop.invoke("library:documents:move", {
            documentIds: [item.document.id], folderId: item.folderId,
          });
          changed();
        });
      } catch (error) {
        remaining.push(item);
        failures.push(`${item.document.title}: ${errorText(error)}`);
      }
    }
    moveItems.current = remaining;
    setNotice(failures.length ? tr("library:movePartial", {
      succeeded: format.number(moved), total: format.number(targets.length),
      failed: format.number(failures.length), reasons: failures.join("; "),
    }) : "");
    if (moved) changed();
    if (!failures.length) { setMove(false); setMenu(null); }
  };
  const reorder = async (item: Item, delta: number) => {
    const destination = reorderDestination(items, items.indexOf(item), delta);
    if (!destination) return;
    await run(() => desktop.invoke("library:documents:move", { documentIds: [item.document.id], ...destination }));
  };
  const bulkBar=useRef<HTMLDivElement>(null);
  const [bulkHeight,setBulkHeight]=useState(0);
  useLayoutEffect(()=>{const bar=bulkBar.current;if(!bar){setBulkHeight(0);return;}const observer=new ResizeObserver(()=>setBulkHeight(bar.getBoundingClientRect().height));observer.observe(bar);return()=>observer.disconnect();},[selected.length]);
  const [textScale,setTextScale]=useState(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
  useEffect(()=>{const update=()=>setTextScale(parseFloat(getComputedStyle(document.documentElement).fontSize));const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['style']});window.addEventListener('resize',update);return()=>{observer.disconnect();window.removeEventListener('resize',update);};},[]);
  const [viewportWidth, setViewportWidth] = useState(700);
  useLayoutEffect(() => {
    const viewport = scroller.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => setViewportWidth(viewport.clientWidth));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [loading, grid, items.length > 0, showFolders]);
  const rowRem=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(query.text?'--library-search-row-height':'--library-row-height'));
  const rowHeight = grid ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--art-reader-card-height")) : rowRem * textScale,
    columns = grid
      ? Math.max(1, Math.floor(viewportWidth / 280))
      : 1,
    start = Math.min(Math.max(0,shown.length-columns),Math.max(0, Math.floor(top / rowHeight) - 2) * columns),
    end = Math.min(
      shown.length,
      start +
        Math.ceil((scroller.current?.clientHeight ?? 800) / rowHeight + 5) *
          columns,
    );
  useLayoutEffect(()=>{
    const viewport=scroller.current;
    if(!viewport||!selected.length||!bulkHeight)return;
    const index=shown.findIndex(item=>item.document.id===selected[selected.length-1]);
    if(index<0)return;
    const rowTop=Math.floor(index/columns)*rowHeight;
    const available=Math.max(rowHeight,viewport.clientHeight-bulkHeight-24);
    if(rowTop<viewport.scrollTop)viewport.scrollTop=rowTop;
    else if(rowTop+rowHeight>viewport.scrollTop+available)viewport.scrollTop=rowTop+rowHeight-available;
  },[selected,bulkHeight,rowHeight,columns,shown]);
  const viewControls = (
    <div className="library-view-controls">
        <Select
          className="library-sort"
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
        </Select>
        <Button variant="outline"
          className="library-sort"
          aria-label={tr("library:direction")}
          onClick={() =>
            setQuery((q) => ({
              ...q,
              direction: q.direction === "asc" ? "desc" : "asc",
            }))
          }
        >
          {query.direction === "asc" ? "↑" : "↓"}
        </Button>
        <Button variant="outline"
          aria-label={tr("library:viewToggle")}
          aria-pressed={grid}
          onClick={() =>
            setGrid((v) => {
              localStorage.setItem("library-grid", String(!v));
              return !v;
            })
          }
        >
          {grid ? <LayoutGrid /> : <List />}
        </Button>
    </div>
  );
  const liveRegion = (
    <div className="library-live" aria-live="polite">
        {tr("library:loaded", {
          count: items.length,
          formatted: format.number(items.length),
        })}
        {notice || recoveryNotice}
      </div>
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
          <h1>{route.title ?? (folderPath(folders, query.folderId) || tr("common:library"))}</h1>
          <p className="muted">{tr("library:documentCount", { count: items.length, formatted: format.number(items.length) + (cursor ? "+" : "") })}</p>
        </div>
        <Button variant="outline" className="primary"
          hidden={!loading && !items.length && !text && !filters.length}
          data-testid="import-document"
          onClick={() => void run(() => importFiles(query.folderId ?? null))}
        >
          {tr("common:import_document")}
        </Button>
      </div>
      <div className="library-toolbar" hidden={!loading && !items.length && !text && !filters.length && !query.folderId}>
        {viewKey === "all" && !query.folderId && <LibraryModeToggle mode={mode} onChange={chooseMode} />}
        <label className="library-search">
          <Search aria-hidden="true" />
          <Input
            aria-label={tr("library:search")}
            placeholder={tr("library:search")}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}><PopoverTrigger asChild>
          <Button variant="outline" className="secondary" data-testid="library-filters" aria-expanded={filtersOpen} aria-controls="library-filter-panel"><SlidersHorizontal aria-hidden="true" />{tr("library:filters")}{filters.length > 0 && <span>{format.number(filters.length)}</span>}</Button></PopoverTrigger>
          <PopoverContent id="library-filter-panel" aria-label={tr("library:filters")} align="start" className="filter-panel">
            {(
              ["type", "status", "converter", "tagId", "folderId"] as const
            ).map((key) => (
              <label key={key}>
                {tr(`library:${key}`)}
                <Select
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
                </Select>
              </label>
            ))}
            {(["subfolders", "hasChats", "pinned"] as const).map((key) => (
              <label key={key}>
                <Checkbox
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
            <label>{tr("library:addedAfter")}<Select aria-label={tr("library:addedAfter")} value={customDates ? 'custom' : query.addedAfter ? 'current' : ''} onChange={e => { if(e.target.value === "custom") {setCustomDates(true);return;} setCustomDates(false); setQuery(q => ({...q, addedAfter:e.target.value ? new Date(Date.now() - Number(e.target.value) * 86400000).toISOString() : undefined})); }}>
              <option value="">{tr("library:any")}</option><option value="7">{tr("library:past7")}</option><option value="30">{tr("library:past30")}</option><option value="365">{tr("library:pastYear")}</option><option value="custom">{tr("library:customDates")}</option>{query.addedAfter && <option value="current">{format.date(query.addedAfter)}</option>}
            </Select></label>
            {customDates && (["addedAfter","addedBefore"] as const).map(key => <label key={key}>{tr(`library:${key}`)}<Input type="date" aria-label={tr(`library:${key}`)} value={query[key]?.slice(0,10) ?? ''} onChange={e => setQuery(q => ({...q,[key]:e.target.value ? new Date(e.target.value).toISOString() : undefined}))}/></label>)}
            <label>{tr("library:size")}<Select aria-label={tr("library:size")} value={query.minSize === 10000000 ? 'large' : query.minSize === 1000000 ? 'medium' : query.maxSize ? 'small' : ''} onChange={e => setQuery(q => ({...q,minSize:e.target.value === 'large' ? 10000000 : e.target.value === 'medium' ? 1000000 : undefined,maxSize:e.target.value === 'small' ? 1000000 : e.target.value === 'medium' ? 10000000 : undefined}))}>
              <option value="">{tr("library:any")}</option><option value="small">{tr("library:sizeSmall")}</option><option value="medium">{tr("library:sizeMedium")}</option><option value="large">{tr("library:sizeLarge")}</option>
            </Select></label>
            {!showFolders && compactToolbar && <div className="filter-view"><span>{tr("library:sort")}</span>{viewControls}</div>}
            <footer><Button variant="outline" className="ghost" onClick={clearFilters}>{tr("library:clearFilters")}</Button><Button variant="outline" className="secondary" onClick={() => setFiltersOpen(false)}>{tr("library:close")}</Button></footer>
          </PopoverContent>
        </Popover>
        {!showFolders && !compactToolbar && viewControls}
      </div>
      <div className="filter-chips">
        {filters.map(([key, value]) => (
          <Button variant="outline"
            key={key}
            onClick={() => setQuery((q) => ({ ...q, [key]: undefined }))}
          >
            {tr(`library:${key}`)}:{" "}
            {typeof value === "boolean"
              ? tr("library:yes")
              : (folders.find((f) => f.id === value)?.name ??
                tags.find((t) => t.id === value)?.name ??
                (["status", "type"].includes(key) ? tr(`library:${value}`) : String(value)))}{" "}
            <X size={12} aria-hidden="true" />
          </Button>
        ))}
        {filters.length > 0 && (
          <>
            <Button variant="outline" className="ghost" onClick={clearFilters}>
              {tr("library:clearFilters")}
            </Button>
            <Button variant="outline" className="ghost"
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
            </Button>
          </>
        )}
      </div>
      {selected.length > 0 && (
        <div className="bulk-bar" ref={bulkBar}>
          <span role="status">
            {tr("library:selected", {
              count: selected.length,
              formatted: format.number(selected.length),
            })}
          </span>
          <Button variant="outline"
            onClick={async () => {
              setMenu(null);
              openMove(true);
            }}
          >
            {tr("library:move")}
          </Button>
          <Button variant="outline"
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
          </Button>
          <Button variant="outline" onClick={() => void remove(selected)}>
            {tr("library:delete")}
          </Button>
          <Button variant="outline" onClick={() => setSelected([])}>
            {tr("library:clearSelection")}
          </Button>
        </div>
      )}
      {text.trim().length === 1 ? <p role="status">{tr('errors:search_refine')}</p> : error ? (
        <div className="empty" role="alert">
          <h2>{tr("library:error")}</h2>
          <p>{error}</p>
          <Button variant="outline" onClick={refresh}>{tr("library:retry")}</Button>
        </div>
      ) : loading && !items.length ? (
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
          <Brand/>
          <h2>
            {tr(
              `library:empty_${text ? "search" : filters.length ? "filter" : query.folderId ? "folder" : "library"}`,
              { query: text })}
          </h2>
          <p>{tr(text ? "library:searchHint" : filters.length ? "library:filterHint" : "library:emptyHint")}</p>
          <Button variant="outline"
            onClick={() =>
              text
                ? setText("")
                : filters.length
                  ? clearFilters()
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
          </Button>
          {!text && !filters.length && <Button variant="outline" className="ghost" onClick={() => void run(async () => { await desktop.invoke('documents:importSample',{language:document.documentElement.lang.startsWith('ja') ? 'ja' : document.documentElement.lang.startsWith('zh') ? 'zh-Hant' : 'en'}); changed(); })}>{tr('onboarding:sample')}</Button>}
        </div>
      ) : showFolders ? (
        <div className="library-folders">
          <FolderGrid groups={groups} formatNumber={format.number} onOpen={selectFolder} />
        </div>
      ) : (
        <>
        {openGroup && <FolderCrumbs name={openGroup.name ?? tr("library:unfiled")} onBack={() => selectFolder(null)} />}
        <div
          ref={scroller}
          className="library-results"
          data-view={grid ? "grid" : "list"}
          data-bulk={selected.length>0}
          style={{'--bulkbar-h':`${bulkHeight}px`} as CSSProperties}
          role="list"
          aria-label={tr("library:documents")}
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
              height: Math.ceil(shown.length / columns) * rowHeight,
              position: "relative",
            }}
          >
            {shown.slice(start, end).map((item, offset) => {
              const d = item.document,
                index = start + offset;
              return (
                <div
                  key={d.id}
                  id={`library-document-${d.id}`}
                  data-index={index}
                  role="listitem"
                  aria-posinset={index + 1}
                  aria-setsize={shown.length}
                  data-selected={selected.includes(d.id)}
                  tabIndex={tabRow === d.id ? 0 : -1}
                  onFocus={() => { setActiveRow(d.id);  }}
                  onMouseEnter={() => {  }}
                  className={`library-document ${grid ? "document-card" : ""}`}
                  style={{
                    height: grid ? rowHeight - 16 : rowHeight,
                    position: "absolute",
                    top: Math.floor(index / columns) * rowHeight,
                    left: `${((index % columns) * 100) / columns}%`,
                    width: grid ? `calc(${100 / columns}% - var(--space-4))` : "100%",
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
                        ? selectedRange(shown, anchor.current, d.id)
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
                    menuAnchor.current = e.currentTarget; setMenu(item);
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const sideways = grid && ["ArrowLeft", "ArrowRight"].includes(e.key);
                    const step = sideways ? 1 : grid ? columns : 1;
                    if (
                      (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key) || sideways) &&
                      !e.altKey &&
                      !e.metaKey &&
                      !e.ctrlKey
                    ) {
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? shown.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  shown.length - 1,
                                  index + (e.key === "ArrowUp" || e.key === "ArrowLeft" ? -step : step),
                                ),
                              );
                      if (e.shiftKey) setSelected(selectedRange(shown, anchor.current ?? d.id, shown[next]!.document.id));
                      if (!anchor.current) anchor.current = d.id;
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
                    if (e.key === "Enter") open(item, e.metaKey || e.ctrlKey);
                    if (e.key === " ") {
                      e.preventDefault();
                      setSelected([d.id]);
                    }
                    if (
                      e.key === "ContextMenu" ||
                      (e.shiftKey && e.key === "F10")
                    ) {
                      e.preventDefault();
                      menuAnchor.current = e.currentTarget; setMenu(item);
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
{grid ? <><DocumentArt id={d.id} kind={d.sourceName.split('.').pop()?.toUpperCase() ?? 'MD'}/><div className="document-cell">
                    <FileText className="document-glyph" aria-hidden="true" />
                    <div className="document-info">
                      <Button variant="outline"
                        className="document-title"
                        tabIndex={-1}
                        lang={contentLanguage(d.title)}
                        onAuxClick={event => { if (event.button === 1) { event.preventDefault(); open(item, true); } }}
                        onClick={event => open(item, event.metaKey || event.ctrlKey)}
                      >
                        {d.title}
                      </Button>
                      <div className="document-meta" title={`${d.sourceName} · ${d.converter}`}>
                        {!query.folderId && <span className="document-course">{placeOf(item)}</span>}
                        <span>{d.sourceName.split('.').pop()?.toUpperCase()}</span>
                        {item.pageCount != null && <span>{tr("library:pages", {count:item.pageCount, formatted:format.number(item.pageCount)})}</span>}
                        <span>{formatSize(item.sizeBytes, document.documentElement.lang)}</span>
                        <span>{format.date(d.createdAt)}</span>
                        {d.status !== 'ready' && <span className="status-badge" data-status={d.status}>{d.status === 'failed' ? <AlertTriangle/> : <LoaderCircle/>}{tr(`library:${d.status}`)}</span>}
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
                        {d.status === "failed" && (
                          <Button variant="outline"
                            onClick={() =>
                              void run(() =>
                                desktop.invoke("documents:retry", {
                                  documentId: d.id,
                                }),
                              )
                            }
                          >
                            {tr("library:retry")}
                          </Button>
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
                    <Button variant="outline"
                      aria-label={`${tr("library:pin")}: ${d.title}`}
                      tabIndex={-1}
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
                    </Button>
                    <Button variant="outline"
                      aria-label={tr("library:actions", { name: d.title })}
                      tabIndex={-1}
                      onClick={(e) => { menuAnchor.current = e.currentTarget; setMenu(item); }}
                    >
                      <MoreHorizontal />
                    </Button>
                  </div></> : <>                  <div className="document-gutter" title={d.status!=='ready'?tr(`library:${d.status}`):item.pinned?tr('library:pinned'):undefined}>
                    {d.status==='failed'?<AlertTriangle className="failed"/>:d.status==='converting'?<LoaderCircle/>:item.pinned?<Pin fill="currentColor"/>:null}
                    <span className="sr-only">{d.status!=='ready'?tr(`library:${d.status}`):item.pinned?tr('library:pinned'):''}</span>
                  </div>
                  <div className="document-title-cell">
                    <DocumentTitle title={d.title} onOpen={event=>open(item,event.button === 1 || event.metaKey || event.ctrlKey)} details={`${placeOf(item)} · ${d.sourceName.split('.').pop()?.toUpperCase()} · ${item.pageCount!=null?tr('library:pages',{count:item.pageCount,formatted:format.number(item.pageCount)}):''} · ${formatSize(item.sizeBytes,document.documentElement.lang)} · ${format.date(d.createdAt)}`}/>

                    <div className="document-course-inline" title={placeOf(item)}>{placeOf(item)}</div>
                    {item.snippet&&<p className="search-snippet"><Snippet text={item.snippet}/></p>}
                  </div>
                  <div className="document-tags">{item.tags?.slice(0,2).map(t=><Badge variant="outline" key={t.id}>{t.name}</Badge>)}{(item.tags?.length??0)>2&&<span>+{item.tags!.length-2}</span>}</div>
                  <div className="document-folder" title={placeOf(item)}>{placeOf(item)}</div>
                  <div className="document-size">{item.pageCount!=null&&<>{tr('library:pages',{count:item.pageCount,formatted:format.number(item.pageCount)})} · </>}{item.sizeBytes===null?tr("library:unknown_size"):new Intl.NumberFormat(document.documentElement.lang,{style:"unit",unit:"kilobyte",unitDisplay:"short",maximumFractionDigits:1}).format(item.sizeBytes/1000)}</div>
                  <div className="document-added">{d.status==='failed'?<Button variant="ghost" size="sm" onClick={()=>void run(()=>desktop.invoke('documents:retry',{documentId:d.id}))}>{tr('library:retry')}</Button>:d.status==='converting'?<progress value={progress[d.id]?.page} max={progress[d.id]?.total} aria-label={tr('common:conversion_progress')}/>:format.date(d.createdAt)}</div>
                  <div className="document-type"><Badge variant="secondary">{d.sourceName.split('.').pop()?.toUpperCase()}</Badge></div>
                  <Button variant="ghost" size="icon-sm" className="document-actions" aria-label={tr('library:actions',{name:d.title})} tabIndex={-1} onClick={e=>{menuAnchor.current=e.currentTarget;setMenu(item);}}><MoreHorizontal/></Button></>}
                </div>
              );
            })}
          </div>
          {cursor && !groupedView && (
            <Button variant="outline" className="load-more" onClick={() => void more()}>
              {tr("library:loadMore")}
            </Button>
          )}
        </div>
        </>
      )}
      {!move && liveRegion}
      {(notice || recoveryNotice) && (
        <div className="library-toast" role="status">
          {notice || recoveryNotice}
          {recoveries.length > 0 && (
            <Button variant="outline"
              onClick={() =>
                void run(async () => {
                  await recovery.undo();
                  setNotice("");
                })
              }
            >
              {tr("library:undo")}{recoveries.length > 1 ? ` (${format.number(recoveries.length)})` : ""}
            </Button>
          )}
        </div>
      )}
      <LibraryMenus moveNotice={notice} liveRegion={liveRegion} menu={menu} move={move} tagging={tagging} anchor={menuAnchor.current} items={items} folders={folders} tags={tags} ids={ids} prompt={prompt} run={run} remove={remove} moveTo={moveTo} open={open} setMenu={setMenu} setMove={openMove} setTagging={setTagging}/>
      {promptDialog}
    </section>
  );
}
