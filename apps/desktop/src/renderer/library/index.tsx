import { provesExistence } from './selection';
import { virtualWindow } from './window';
import { localDate, dayBound, validDay } from './dates';
import { recovery } from "./recovery";
import { openDocument } from '../document-open';
import type { CSSProperties } from 'react';
import { PageContainer, PageHeader, Toolbar, FormField, EmptyState, Card } from '../components/ui';
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
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
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
export function formatSize(bytes: number | null, locale: string, short = false) {
    if (bytes === null) return tr("library:unknown_size");
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  const exponent = Math.min(3, Math.max(0, Math.floor(Math.log10(Math.max(1, bytes)) / 3)));
  return new Intl.NumberFormat(locale, { style: 'unit', unitDisplay:short ? 'short' : 'long', unit: units[exponent], maximumFractionDigits: 1 }).format(bytes / 1000 ** exponent);
}
function DocumentTitle({title,details,onOpen}:{title:string;details:string;onOpen:(event: React.MouseEvent<HTMLButtonElement>)=>void}) {
 const ref=useRef<HTMLButtonElement>(null);const [visible,setVisible]=useState(false);
 return <Tooltip delayDuration={500} open={visible} onOpenChange={next=>{const button=ref.current;const hidden=button?.closest('.library-document')?.querySelectorAll(':scope > div');setVisible(next&&!!button&&(button.scrollWidth>button.clientWidth||Array.from(hidden??[]).some(e=>getComputedStyle(e).display==='none')));}}><TooltipTrigger asChild><Button ref={ref} variant="ghost" className="document-title" tabIndex={-1} lang={contentLanguage(title)} onAuxClick={event=>{if(event.button===1){event.preventDefault();onOpen(event);}}} onClick={onOpen}>{title}</Button></TooltipTrigger><TooltipContent className="document-tooltip"><div>{title}</div><div>{details}</div></TooltipContent></Tooltip>;
}
function useEvent<T extends (...args: never[]) => unknown>(callback: T): T {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; });
  return useCallback(((...args) => latest.current(...args)) as T, []);
}
function retainItems(previous: Item[], next: Item[]) {
  const byId = new Map(previous.map(item => [item.document.id, item]));
  return next.map(item => {
    const old = byId.get(item.document.id);
    return old && JSON.stringify(old) === JSON.stringify(item) ? old : item;
  });
}
function StatusBlock({id, measure, children}: {
  id: string; measure: (id: string, height: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current!;
    const update = () => measure(id, element.getBoundingClientRect().height);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [id, measure]);
  return <div ref={ref} className="document-status">{children}</div>;
}
type RowProps = {
  item: Item; index: number; count: number; grid: boolean;
  height: number; offset: number; columns: number; tabRow: boolean;
  selected: boolean; folderId: string | null | undefined; place: string;
  language: string; locale: string | undefined; page: number | undefined;
  measure: (id: string, height: number) => void;
  total: number | undefined; render: () => React.ReactNode;
};
const DocumentRow = memo(function DocumentRow({render, item, grid, measure}: RowProps) {
  useLayoutEffect(() => {
    if (!grid) return;
    const element = document.getElementById(`library-document-${item.document.id}`)!;
    const update = () => measure(item.document.id, element.getBoundingClientRect().height);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [grid, item.document.id, measure]);
  return render();
}, (previous, next) => (Object.keys(previous) as (keyof RowProps)[])
  .every(key => key === "render" || previous[key] === next[key]));
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
  const { i18n } = useTranslation();
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
    setDateDraft({addedAfter:"",addedBefore:""});
    setDateError(false);
    setQuery(q => ({
      ...defaults, sort: q.sort, direction: q.direction,
      view: q.view, folderId: q.folderId, subfolders: q.subfolders,
      text: text.trim() || undefined,
    }));
  };
  const [customDates,setCustomDates] = useState(false);
  const [dateDraft, setDateDraft] = useState({
    addedAfter: localDate(query.addedAfter),
    addedBefore: localDate(query.addedBefore),
  });
  const [dateError, setDateError] = useState(false);
  const updateDate = (key: "addedAfter" | "addedBefore", value: string) => {
    const next = { ...dateDraft, [key]: value };
    setDateDraft(next);
    const invalid = !validDay(next.addedAfter) || !validDay(next.addedBefore) || !!(next.addedAfter && next.addedBefore && next.addedAfter > next.addedBefore);
    setDateError(invalid);
    if (!invalid) setQuery(q => ({
      ...q,
      addedAfter: next.addedAfter ? dayBound(next.addedAfter) : undefined,
      addedBefore: next.addedBefore ? dayBound(next.addedBefore,true) : undefined,
    }));
  };
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
  const loadedCount = useRef(0);
  loadedCount.current = items.length;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedItems = useRef(new Map<Item["document"]["id"], Item>());
  useLayoutEffect(() => {
    for (const id of selectedItems.current.keys()) {
      if (!selectedSet.has(id)) selectedItems.current.delete(id);
    }
    for (const item of items) {
      if (selectedSet.has(item.document.id)) selectedItems.current.set(item.document.id, item);
    }
  }, [items, selectedSet]);
  const selectedIds = useRef(selected);
  selectedIds.current = selected;
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
  const heading = useRef<HTMLHeadingElement>(null);
  const folderFocus = useRef<string | null>(null);
  const selectFolder = (key: string | null) => {
    folderFocus.current = key === openKey ? null : key ? "heading" : openKey;
    setOpenKey(key);
    anchor.current = "";
    setActiveRow(undefined);
    setSelected([]);
    restoreTop.current = 0;
    try { if (key) sessionStorage.setItem(`library-folder:${viewKey}`, key); else sessionStorage.removeItem(`library-folder:${viewKey}`); }
    catch { /* A blocked session store only loses the reopened folder. */ }
  };
  useLayoutEffect(() => {
    const target = folderFocus.current;
    if (!target) return;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const restore = () => {
      if (folderFocus.current !== target) return;
      const element = target === "heading" ? heading.current
        : document.getElementById(`library-folder-${encodeURIComponent(target)}`);
      if (element) {
        element.focus();
        folderFocus.current = null;
      } else if (++attempts < 10) timer = setTimeout(restore, 50);
      else {
        (document.querySelector<HTMLElement>(".course-folder") ?? heading.current)?.focus();
        folderFocus.current = null;
      }
    };
    restore();
    return () => clearTimeout(timer);
  }, [openKey, showFolders, loading, groups]);
  const chooseMode = (next: LibraryMode) => {
    writeMode(next);
    setModeState(next);
    selectFolder(null);
    folderFocus.current = null;
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
    let pending = false;
    let cancelled = false;
    let cursor: LibraryQuery["cursor"];
    const timer = setInterval(async () => {
      if (pending || !items.some(i => i.document.status === "converting")) return;
      pending = true;
      const id = generation.current;
      try {
        const page = await desktop.invoke("library:documents:list", {
          ...query, cursor, limit: 100,
        });
        if (cancelled || id !== generation.current) return;
        cursor = page.nextCursor ?? undefined;
        const updates = new Map(page.items.map(item => [item.document.id, item]));
        setItems(current => retainItems(current, current.map(item => updates.get(item.document.id) ?? item)));
      } catch (error) {
        if (!cancelled) setError(errorText(error));
      } finally { pending = false; }
    }, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [query, items.some(i => i.document.status === "converting")]);
  useEffect(() => {
    localStorage.setItem(
      `library-sort:${viewKey}`,
      JSON.stringify({ sort: query.sort, direction: query.direction }),
    );
    const id = ++generation.current;
    fetching.current = false;
    const sameQuery = previousQuery.current === JSON.stringify(query);
    if (sameQuery) {
      restoreTop.current = scroller.current?.scrollTop ?? restoreTop.current;
    } else {
      setSelected([]);
      anchor.current = "";
      selectedIds.current = [];
      restoreTop.current = 0;
      previousQuery.current = JSON.stringify(query);
    }
    if (!loadedCount.current) setLoading(true);
    setError("");
    void Promise.all([
      desktop.invoke("library:documents:list", {
        ...query, cursor: undefined,
        limit: sameQuery ? Math.min(100, Math.max(query.limit, loadedCount.current)) : query.limit,
      }),
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
        let extraPages = 0;
        while (
          sameQuery && page.nextCursor &&
          (rows.length < loadedCount.current ||
            (revision === 0 && extraPages < 2 &&
              (rows.length * 64) / multiplier < restoreTop.current + 800))
        ) {
          extraPages++;
          const next = await desktop.invoke("library:documents:list", {
            ...query,
            cursor: page.nextCursor,
            limit: 100,
          });
          if (id !== generation.current) return;
          rows.push(...next.items);
          page.nextCursor = next.nextCursor;
        }
        setItems(current => retainItems(current, rows));
        const available = new Set<string>(rows.map(item => item.document.id));
        if (anchor.current && !available.has(anchor.current)) anchor.current = "";
        if (provesExistence(query, page.nextCursor)) {
          const missing = selectedIds.current.filter(id => !available.has(id));
          if (missing.length) {
            setSelected(current => current.filter(id => available.has(id)));
            setNotice(tr("library:selectedMissing", {count: missing.length}));
          }
        }
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
  const latestRecovery = recoveries.at(-1);
  const recoveryNotice = latestRecovery ? tr(latestRecovery.key, {
    ...latestRecovery.params,
    name: latestRecovery.params.title ?? tr('library:recoveryCount', latestRecovery.params),
  }) : '';
  const focusAfter = useRef<string | null>(null);
  const [activeRow, setActiveRow] = useState<string>();
  const keyboardFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!loading && focusAfter.current) {
      const target = document.getElementById(focusAfter.current);
      (target ?? scroller.current ?? document.getElementById("shell-content"))?.focus();
      focusAfter.current = null;
    }
  }, [loading, items]);
  const run = useEvent(async (action: () => Promise<unknown>) => {
    const focused = document.activeElement as HTMLElement | null;
    focusAfter.current = focused?.closest<HTMLElement>("[data-index]")?.id ?? menuAnchor.current?.closest<HTMLElement>("[data-index]")?.id ?? "shell-content";
    try {
      await action();
    } catch (e) {
      setNotice(errorText(e));
    } finally { changed(); }
  });
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
  const open = useEvent((item: Item, newTab = false) => {
    void run(() => openDocument(item.document.id, () => (newTab ? openTab : navigate)({
      view: "workspace",
      documentId: item.document.id,
      query: route.query,
      title: newTab ? item.document.title : route.title,
    })));
  });
  const ids =
    menu && !selectedSet.has(menu.document.id)
      ? [menu.document.id]
      : selected;
  const inFlight = useRef(false);
  const [busy,setBusy] = useState(false);
  const remove = async (targets: Item["document"]["id"][]) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try { await run(async () => {
      const failures: string[] = [];
      const restored: Item["document"]["id"][] = [];
      const deadline = Date.now() + 30000;
      let deleted = 0;
      for (const documentId of targets) {
        try {
          await desktop.invoke("library:documents:softDelete", { documentId });
          deleted++;
          restored.push(documentId);
          selectedIds.current = selectedIds.current.filter(id => id !== documentId);
          setSelected(selectedIds.current);
        } catch (error) {
          const title = items.find(item => item.document.id === documentId)?.document.title ?? documentId;
          failures.push(`${title}: ${errorText(error)}`);
        }
      }
      if (restored.length) recovery.add('library:recoveryDeleted', async () => {
        try {
          const results = await Promise.allSettled(restored.map(documentId =>
            desktop.invoke('library:documents:restore', {documentId})));
          const failure = results.find(result => result.status === 'rejected');
          if (failure?.status === 'rejected') throw failure.reason;
        } finally { changed(); }
      }, deadline, {
        count: restored.length,
        title: restored.length === 1
          ? items.find(item => item.document.id === restored[0])?.document.title ?? restored[0]
          : undefined,
      });
      setNotice(failures.length ? tr("library:deletePartial", {
        succeeded: format.number(deleted), total: format.number(targets.length),
        failed: format.number(failures.length), reasons: failures.join("; "),
      }) : "");
    });
    setMenu(null);
    } finally { inFlight.current = false; setBusy(false); }
  };
  const moveItems = useRef<Item[]>([]);
  const openMove = (value: boolean) => {
    if (value) setNotice("");
    if (value) moveItems.current = menu && !selectedSet.has(menu.document.id)
      ? [menu] : ids.flatMap(id => {
        const item = selectedItems.current.get(id);
        return item ? [item] : [];
      });
    setMove(value);
  };
  const moveTo = async (folderId: Folder["id"] | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
    const targets = moveItems.current;
    const failures: string[] = [];
    const remaining: Item[] = [];
    const restored: Item[] = [];
    const deadline = Date.now() + 30000;
    let moved = 0;
    for (const item of targets) {
      try {
        await desktop.invoke("library:documents:move", {
          documentIds: [item.document.id], folderId,
        });
        moved++;
        restored.push(item);
        selectedIds.current = selectedIds.current.filter(id => id !== item.document.id);
        setSelected(selectedIds.current);
      } catch (error) {
        remaining.push(item);
        failures.push(`${item.document.title}: ${errorText(error)}`);
      }
    }
    if (restored.length) recovery.add('library:recoveryMoved', async () => {
      try {
        const results = await Promise.allSettled(restored.map(item =>
          desktop.invoke('library:documents:move', {
            documentIds: [item.document.id], folderId: item.folderId,
          })));
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      } finally { changed(); }
    }, deadline, {
      count: restored.length,
      title: restored.length === 1 ? restored[0]!.document.title : undefined,
    });
    moveItems.current = remaining;
    setNotice(failures.length ? tr("library:movePartial", {
      succeeded: format.number(moved), total: format.number(targets.length),
      failed: format.number(failures.length), reasons: failures.join("; "),
    }) : "");
    if (moved || failures.length) changed();
    if (!failures.length) { setMove(false); setMenu(null); }
    } finally { inFlight.current = false; setBusy(false); }
  };
  const reorder = async (item: Item, delta: number) => {
    const current = rowContext.current.items;
    const destination = reorderDestination(current, current.findIndex(row => row.document.id === item.document.id), delta);
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
  const baseHeight = grid ? 10 * (textScale || 16) : (rowRem || 2.75) * (textScale || 16);
  const rowHeight = baseHeight;
  const columns = grid ? Math.max(1, Math.floor(viewportWidth / 280)) : 1;
  const [statusHeights, setStatusHeights] = useState<Record<string, number>>({});
  const measureStatus = useCallback((id: string, height: number) => {
    if (height <= 0) return;
    setStatusHeights(current => current[id] === height ? current : {...current, [id]: height});
  }, []);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const measureCard = useCallback((id: string, height: number) => {
    if (height <= 0) return;
    setCardHeights(current => current[id] === height ? current : {...current, [id]: height});
  }, []);
  const itemHeight = (item: Item) => grid && cardHeights[item.document.id]
    ? cardHeights[item.document.id]! : rowHeight + (item.document.status === "ready"
    ? 0 : statusHeights[item.document.id] ?? 80 * (textScale || 16) / 16);
  const layout = useMemo(() => {
    const offsets = [0];
    const heights: number[] = [];
    for (let index = 0; index < shown.length; index += columns) {
      const height = Math.max(...shown.slice(index, index + columns).map(itemHeight)) + (grid ? 16 : 0);
      heights.push(height);
      offsets.push(offsets[offsets.length - 1]! + height);
    }
    return { offsets, heights };
  }, [shown, columns, rowHeight, statusHeights, cardHeights, textScale, grid]);
  const rowContext = useRef({ shown, items, layout, columns, rowHeight, grid, selected, selectedSet });
  rowContext.current = { shown, items, layout, columns, rowHeight, grid, selected, selectedSet };
  const {start, end} = virtualWindow(
    layout.offsets, columns, shown.length, top,
    scroller.current?.clientHeight || 800,
  );
  const visibleIndices = Array.from(
    {length: end - start},
    (_, offset) => start + offset,
  );
  const activeIndex = shown.findIndex(item => item.document.id === activeRow);
  const tabRow = visibleIndices.includes(activeIndex) ? activeRow
    : visibleIndices.map(index => shown[index]!).find(item => selectedSet.has(item.document.id))?.document.id
      ?? shown[visibleIndices[0] ?? 0]?.document.id;
  const renderedIndices = activeIndex >= 0 && !visibleIndices.includes(activeIndex)
    ? [...visibleIndices, activeIndex].sort((a, b) => a - b) : visibleIndices;
  useLayoutEffect(() => {
    if (!keyboardFocus.current) return;
    const target = document.getElementById(`library-document-${keyboardFocus.current}`);
    target?.focus({preventScroll:true});
    keyboardFocus.current = null;
  }, [activeRow, start, end]);
  useLayoutEffect(()=>{
    const viewport=scroller.current;
    if(!viewport||!selected.length||!bulkHeight)return;
    const index=shown.findIndex(item=>item.document.id===selected[selected.length-1]);
    if(index<0)return;
    const rowTop=layout.offsets[Math.floor(index/columns)]!;
    const available=Math.max(rowHeight,viewport.clientHeight-bulkHeight-24);
    if(rowTop<viewport.scrollTop)viewport.scrollTop=rowTop;
    else if(rowTop+layout.heights[Math.floor(index/columns)]!>viewport.scrollTop+available)viewport.scrollTop=rowTop+layout.heights[Math.floor(index/columns)]!-available;
  },[selected,bulkHeight,rowHeight,columns,shown,layout]);
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
  const DocumentSurface = grid ? Card : "div";
  const liveRegion = (
    <div className="library-live" aria-live="polite">
        {dateError ? tr('library:dateRangeInvalid') : notice || recoveryNotice || tr('library:loaded', {
          count: items.length, formatted: format.number(items.length),
        })}
        {!dateError && !notice && latestRecovery && ` · ${tr('library:recoveryAction', {number: latestRecovery.sequence})}`}
      </div>
  );
  return (
    <PageContainer
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
      <PageHeader
        ref={element => {
          heading.current = element?.querySelector('h1') ?? null;
          heading.current?.setAttribute('tabindex', '-1');
        }}
        title={openGroup ? openGroup.name ?? tr("library:unfiled") : (folderPath(folders, query.folderId) || route.title || tr("common:library"))}
        description={tr("library:documentCount", {
          count: items.length,
          formatted: format.number(items.length) + (cursor ? "+" : ""),
        })}
        actions={
        <Button variant="outline" className="primary"
          hidden={!loading && !items.length && !text && !filters.length}
          data-testid="import-document"
          onClick={() => void run(() => importFiles(query.folderId ?? null))}
        >
          {tr("common:import_document")}
        </Button>
        }
      />
      <Toolbar className="library-toolbar" hidden={!loading && !items.length && !text && !filters.length && !query.folderId} left={<>
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
          <PopoverContent id="library-filter-panel" aria-label={tr("library:filters")} align="start" collisionPadding={16} className="filter-panel">
            {(
              ["type", "status", "converter", "tagId", "folderId"] as const
            ).map((key) => (
              <FormField key={key} label={tr(`library:${key}`)}>
                {control => <Select {...control}
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
                </Select>}
              </FormField>
            ))}
            {(["subfolders", "hasChats", "pinned"] as const).map((key) => (
              <FormField key={key} label={tr(`library:${key}`)}>
                {control => <Checkbox {...control} style={{width:40, height:40}}
                  checked={query[key] ?? false}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      [key]: e.target.checked || undefined,
                    }))
                  }
                />}
              </FormField>
            ))}
            <FormField label={tr("library:addedAfter")}>{control => <Select {...control} aria-label={tr("library:addedAfter")} value={customDates ? 'custom' : query.addedAfter ? 'current' : ''} onChange={e => { if(e.target.value === "custom") {setDateDraft({addedAfter:localDate(query.addedAfter),addedBefore:localDate(query.addedBefore)});setCustomDates(true);return;} setCustomDates(false); setDateError(false); setQuery(q => ({...q, addedBefore:undefined, addedAfter:e.target.value ? new Date(Date.now() - Number(e.target.value) * 86400000).toISOString() : undefined})); }}>
              <option value="">{tr("library:any")}</option><option value="7">{tr("library:past7")}</option><option value="30">{tr("library:past30")}</option><option value="365">{tr("library:pastYear")}</option><option value="custom">{tr("library:customDates")}</option>{query.addedAfter && <option value="current">{format.date(query.addedAfter)}</option>}
            </Select>}</FormField>
            {customDates && (["addedAfter", "addedBefore"] as const).map(key => (
              <FormField key={key} label={tr(`library:${key}`)}
                error={dateError ? tr("library:dateRangeInvalid") : undefined}>
                {control => <Input {...control} type="date"
                  aria-label={tr(`library:${key}`)} value={dateDraft[key]}
                  onChange={e => updateDate(key, e.target.value)} />}
              </FormField>
            ))}
            <FormField label={tr("library:size")}>{control => <Select {...control} aria-label={tr("library:size")} value={query.minSize === 10000000 ? 'large' : query.minSize === 1000000 ? 'medium' : query.maxSize ? 'small' : ''} onChange={e => setQuery(q => ({...q,minSize:e.target.value === 'large' ? 10000000 : e.target.value === 'medium' ? 1000000 : undefined,maxSize:e.target.value === 'small' ? 1000000 : e.target.value === 'medium' ? 10000000 : undefined}))}>
              <option value="">{tr("library:any")}</option><option value="small">{tr("library:sizeSmall")}</option><option value="medium">{tr("library:sizeMedium")}</option><option value="large">{tr("library:sizeLarge")}</option>
            </Select>}</FormField>
            {!showFolders && compactToolbar && <div className="filter-view"><span>{tr("library:sort")}</span>{viewControls}</div>}
            {filters.length > 0 && <footer><Button variant="outline" className="ghost" onClick={clearFilters}>{tr("library:clearFilters")}</Button></footer>}
          </PopoverContent>
        </Popover>
        {!showFolders && !compactToolbar && viewControls}
      </>} />
      <div className="filter-chips">
        {filters.length > 0 && !filtersOpen && <Button variant="outline"
          className="ghost" onClick={clearFilters}>{tr("library:clearFilters")}</Button>}
        {filters.map(([key, value]) => (
          <Button variant="outline"
            key={key}
            onClick={() => {
              if (key === 'addedAfter' || key === 'addedBefore') {
                setDateDraft(draft => ({...draft,[key]:''}));
                setDateError(false);
              }
              setQuery(q => ({...q,[key]:undefined}));
            }}
          >
            {tr(`library:${key}`)}:{" "}
            {typeof value === "boolean"
              ? tr("library:yes")
              : (folders.find((f) => f.id === value)?.name ??
                tags.find((t) => t.id === value)?.name ??
                (["status", "type", "converter"].includes(key) ? tr(`library:${value}`)
                  : ["addedAfter", "addedBefore"].includes(key) ? format.date(String(value))
                  : ["minSize", "maxSize"].includes(key) ? formatSize(Number(value), language, true)
                  : String(value)))}{" "}
            <X size={12} aria-hidden="true" />
          </Button>
        ))}
        {filters.length > 0 && (
          <>
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
          <Button variant="outline" disabled={busy} onClick={() => void remove(selected)}>
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
        <EmptyState
          className="library-empty"
          headingLevel={2}
          title={tr(
            `library:empty_${text ? "search" : filters.length ? "filter" : query.folderId ? "folder" : "library"}`,
            {query:text},
          )}
          description={tr(text ? "library:searchHint" : filters.length ? "library:filterHint" : "library:emptyHint")}
          action={<>
          <Button
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
          </>}
        />
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
              height: layout.offsets.at(-1),
              display: grid ? "grid" : undefined,
              gridTemplateColumns: grid ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
              gap: grid ? "var(--space-4)" : undefined,
              position: "relative",
            }}
          >
            {renderedIndices.map(index => {
              const item = shown[index]!;
              const d = item.document;
              const lane = Math.floor(index / columns);
              const height = itemHeight(item);
              const offset = layout.offsets[lane]!;
              return <DocumentRow key={d.id} item={item} index={index}
                count={shown.length} grid={grid} measure={measureCard} height={height} offset={offset}
                columns={columns} tabRow={tabRow === d.id} selected={selectedSet.has(d.id)}
                folderId={query.folderId} place={placeOf(item)} language={language}
                locale={i18n.resolvedLanguage} page={progress[d.id]?.page}
                total={progress[d.id]?.total} render={() => (
                <DocumentSurface
                  {...(grid ? {variant:"flat" as const} : {})}
                  id={`library-document-${d.id}`}
                  data-index={index}
                  role="listitem"
                  aria-label={tr("library:rowName", {
                    title:d.title,
                    selection:tr(selectedSet.has(d.id) ? "library:itemSelected" : "library:itemUnselected"),
                  }) + (d.status === "failed" ? ` · ${tr("library:failedInstructions")}` : "")}
                  aria-posinset={index + 1}
                  aria-setsize={shown.length}
                  data-selected={selectedSet.has(d.id)}
                  tabIndex={tabRow === d.id ? 0 : -1}
                  onFocus={() => { setActiveRow(d.id);  }}
                  onMouseEnter={() => {  }}
                  className="library-document"
                  style={{
                    height: grid ? undefined : height,
                    minHeight: grid ? baseHeight : height,
                    rowGap: !grid && d.status !== "ready" ? 0 : undefined,
                    gridTemplateRows: !grid && d.status !== "ready" ? `${rowHeight}px max-content` : undefined,
                    position: "absolute",
                    top: offset,
                    insetInlineStart: `${((index % columns) * 100) / columns}%`,
                    width: grid ? `calc(${100 / columns}% - 16px)` : "100%",
                  }}
                  draggable
                  onDragStart={(e) => {
                    const {items, selected, selectedSet} = rowContext.current;
                    e.dataTransfer.setData(
                      "application/vstudy-origin",
                      JSON.stringify(
                        items
                          .filter((i) =>
                            (selectedSet.has(d.id)
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
                        selectedSet.has(d.id) ? selected : [d.id],
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
                    const {shown} = rowContext.current;
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
                    const {shown, layout, columns, rowHeight, grid} = rowContext.current;
                    const sideways = grid && ["ArrowLeft", "ArrowRight"].includes(e.key);
                    const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 0) / rowHeight));
                    const step = e.key.startsWith("Page") ? page * columns : sideways ? 1 : grid ? columns : 1;
                    if (
                      (["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key) || sideways) &&
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
                                  index + (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key) ? -step : step),
                                ),
                              );
                      if (e.shiftKey) setSelected(selectedRange(shown, anchor.current ?? d.id, shown[next]!.document.id));
                      if (!anchor.current) anchor.current = d.id;
                      keyboardFocus.current = shown[next]!.document.id;
                      setActiveRow(shown[next]!.document.id);
                      if (scroller.current) {
                        const lane = Math.floor(next / columns);
                        const offset = layout.offsets[lane]!;
                        if (!e.key.startsWith("Arrow")) scroller.current.scrollTop = offset;
                        else if (offset < scroller.current.scrollTop) scroller.current.scrollTop = offset;
                        else {
                          const bottom = offset + layout.heights[lane]!;
                          const visibleBottom = scroller.current.scrollTop + scroller.current.clientHeight;
                          if (bottom > visibleBottom) scroller.current.scrollTop = bottom - scroller.current.clientHeight;
                        }
                        setTop(scroller.current.scrollTop);
                      }
                      if (next === index) {
                        e.currentTarget.focus();
                        keyboardFocus.current = null;
                      }
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (d.status === "failed" && !e.shiftKey) void run(() =>
                        desktop.invoke("documents:retry", {documentId:d.id}));
                      else open(item, e.metaKey || e.ctrlKey);
                    }
                    if (e.key === " ") {
                      e.preventDefault();
                      anchor.current = d.id;
                      setSelected(current => current.includes(d.id)
                        ? current.filter(id => id !== d.id) : [...current, d.id]);
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
                  <input type="checkbox" className="sr-only" tabIndex={-1}
                    aria-label={tr('library:selectDocument', {name:d.title})}
                    checked={selectedSet.has(d.id)}
                    onDoubleClick={event => event.stopPropagation()}
                    onChange={event => {
                      anchor.current = d.id;
                      setSelected(current => event.target.checked
                        ? [...current, d.id] : current.filter(id => id !== d.id));
                    }}/>
{grid ? <><div className="document-cell">
                    <div className="document-info">
                      <Button variant="ghost"
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
                        <span>{formatSize(item.sizeBytes, document.documentElement.lang, true)}</span>

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

                      </div>
                    </div>
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
                  <div className="document-added">{format.date(d.createdAt)}</div>
                  <div className="document-type"><Badge variant="secondary">{d.sourceName.split('.').pop()?.toUpperCase()}</Badge></div>
                  <Button variant="ghost" size="icon-sm" className="document-actions" aria-label={tr('library:actions',{name:d.title})} tabIndex={-1} onClick={e=>{menuAnchor.current=e.currentTarget;setMenu(item);}}><MoreHorizontal/></Button></>}
                  {d.status !== 'ready' && <StatusBlock id={d.id} measure={measureStatus}>
                    <span className="status-badge" data-status={d.status}>
                      {d.status === 'failed' ? <AlertTriangle/> : <LoaderCircle/>}
                      {tr(`library:${d.status}`)}
                    </span>
                    {d.status === 'failed' && <Button variant="outline" tabIndex={-1}
                      onClick={() => void run(() => desktop.invoke('documents:retry', {documentId:d.id}))}>
                      {tr('library:retry')}
                    </Button>}
                    {d.status === 'converting' && <progress
                      value={progress[d.id]?.page} max={progress[d.id]?.total}
                      aria-label={tr('common:conversion_progress')}/>}
                  </StatusBlock>}
                </DocumentSurface>
              )} />;
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
      {liveRegion}
      {(notice || recoveryNotice) && (
        <div className="library-toast">
          {notice || recoveryNotice}
          {notice && <Button variant="ghost" onClick={() => setNotice("")}>{tr("library:close")}</Button>}
          {recoveries.length > 0 && (
            <Button variant="outline"
              aria-label={`${tr("library:undo")}: ${recoveryNotice}`}
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
      <LibraryMenus busy={busy} moveNotice={notice} menu={menu} move={move} tagging={tagging} anchor={menuAnchor.current} items={items} folders={folders} tags={tags} ids={ids} prompt={prompt} run={run} remove={remove} moveTo={moveTo} open={open} setMenu={setMenu} setMove={openMove} setTagging={value => { if (value) setNotice(""); setTagging(value); }}/>
      {promptDialog}
    </PageContainer>
  );
}
