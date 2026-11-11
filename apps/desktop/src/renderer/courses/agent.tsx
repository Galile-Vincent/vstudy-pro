import { Card, Button, Divider } from "@astryxdesign/core";
import type { IpcResponse } from '../../shared/ipc';
/** Course chat keeps model output as proposals. Only confirmation cards invoke planner writes or approve material access. */
import { emptyPlanner, type MaterialRequest } from "../../shared/planner";
import { AiSetupNotice } from '../ai-setup';
import { assertCourseAction } from "../../shared/course-actions";
import { plannerApi } from "./planner-api";
import { PlannerProposal } from "./planner-proposal";
import { ConversationList } from "../conversation-list";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { desktop } from "../bridge";
const Chat = lazy(() => import("../chat").then(module => ({ default: module.Chat })));
import type { Conversation } from "../../shared/domain";
import type { Providers } from "../providers";
import { Check, Sparkles } from "lucide-react";
import type {
  MoodleAgentAction,
  MoodleCourseDetail,
} from "../../shared/moodle";
import { moodleAgentActionSchema } from "../../shared/moodle";
import { tr } from "../../shared/i18n";
import { Toolbar } from "../components/ui";
import { Suggestions } from "../components/assistant-ui/elements/suggestions";
import type { MoodleApi } from "./api";

export interface CourseAgentRequest {
  intent: "prepare";
  context: { trust: "untrusted"; course: MoodleCourseDetail };
}
export type CourseAgent = (
  request: CourseAgentRequest,
) => Promise<MoodleAgentAction[]>;

export function CourseAgentPanel({
  detail,
  api,
  agent,
  requested,
  onChange,
  onError,
  onPendingChange,
}: {
  detail: MoodleCourseDetail;
  api: MoodleApi;
  agent?: CourseAgent | undefined;
  requested: number;
  onChange: () => Promise<void>;
  onError: () => void;
  onPendingChange?: ((pending: boolean) => void) | undefined;
}) {
  const [setupVersion, setSetupVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setSetupVersion(v => v + 1);
    window.addEventListener("vstudy:providers-changed", refresh);
    return () => window.removeEventListener("vstudy:providers-changed", refresh);
  }, []);
  const approving = useRef(false);
  const handledRequest = useRef(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation>();
  const [history, setHistory] = useState<IpcResponse<'messages:page'>>({items:[],nextCursor:null});
  const [providers, setProviders] = useState<Providers>([]);
  const [historyJump,setHistoryJump]=useState<string>();
  const [draft, setDraft] = useState("");
  const [promptRequest, setPromptRequest] = useState<{
    text: string;
    id: number;
    materials?: MaterialRequest;
  }>();
  const refreshProviders = async () => {
    setProviders(await desktop.invoke("providers:list", { discover: true }));
  };
  const load = async (c: Conversation) => {
    const messages = await desktop.invoke("messages:page", {
      conversationId: c.id, limit:50, direction:'backward',
    });
    setPromptRequest(undefined);
    setDraft("");
    setHistory(messages);
    setConversation(c);
    setActions([]);
  };
  useEffect(() => {
    if (agent) return;
    let live = true;
    void Promise.all([
      desktop.invoke("conversations:list", {
        scope: "course",
        courseId: detail.course.id,
      }),
      desktop.invoke("providers:list", { discover: true }),
      desktop.invoke("settings:get", {}),
    ])
      .then(async ([list, available, settings]) => {
        const provider =
          available.find(
            (p) =>
              p.config.id === settings.lastProviderId &&
              p.config.enabled &&
              p.availability.available &&
              p.models.length,
          ) ??
          available.find(
            (p) =>
              p.config.enabled && p.availability.available && p.models.length,
          );
        if (!live) return;
        setProviders(available);
        let c = list[0];
        if (!c && provider)
          c = await desktop.invoke("conversations:create", {
            scope: "course",
            courseId: detail.course.id,
            providerId: provider.config.id,
            modelId:
              provider.models.find((m) => m.id === settings.lastModelId)?.id ??
              provider.models[0]!.id,
          });
        if (!live) return;
        setConversations(c && !list.length ? [c] : list);
        if (c) { await load(c); setStatus(current => current === "unavailable" ? "idle" : current); }
        else setStatus("unavailable");
      })
      .catch(() => {
        if (live) setStatus("unavailable");
      });
    return () => {
      live = false;
    };
  }, [detail.course.id, agent, setupVersion]);
  const quick = (key: string) => {
    const promptKey = key === "plan_week" ? "planner:plan_prompt" : key === "catch_up" ? "planner:catch_up_prompt" : key === "exam_prep" ? "planner:exam_prompt" : `moodle:${key}`;
    setPromptRequest({ text: tr(promptKey), id: Date.now() });
  };
  useEffect(() => {
    if (requested > handledRequest.current && conversation) {
      handledRequest.current = requested;
      quick("explain_prepare");
    }
  }, [requested, conversation?.id]);
  const [actions, setActions] = useState<{ id: string; action: MoodleAgentAction }[]>([]);
  const [snapshot, setSnapshot] = useState(emptyPlanner);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void plannerApi.snapshot().then(value => { if (live) setSnapshot(value); }).catch(() => {});
    return () => { live = false; };
  }, [detail.course.id]);
  useEffect(() => { onPendingChange?.(actions.length > 0); }, [actions.length, onPendingChange]);
  const [status, setStatus] = useState<
    "idle" | "busy" | "unavailable" | "done"
  >("idle");
  const prepare = async () => {
    if (!agent) {
      setStatus("unavailable");
      return;
    }
    setStatus("busy");
    try {
      setActions(
        (
          await agent({
            intent: "prepare",
            context: { trust: "untrusted", course: detail },
          })
        ).map((candidate) => {
          const action = moodleAgentActionSchema.parse(candidate);
          assertCourseAction(action, detail, { snapshot, deadlines: detail.deadlines, courseIds: [detail.course.id], documentIds: detail.files.flatMap(f => f.documentId ? [f.documentId] : []), now: Date.now() });
          return { id: crypto.randomUUID(), action };
        }),
      );
      setStatus("idle");
    } catch {
      setStatus("idle");
      onError();
    }
  };
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (status === "done") panel.current?.focus(); }, [status]);
  const approve = async (proposal: { id: string; action: MoodleAgentAction }) => {
    const { action } = proposal;
    if (approving.current) return;
    approving.current = true;
    setStatus("busy");
    try {
      if (action.type === "create-reminder")
        await api.createReminder({
          deadlineId: action.deadlineId,
          remindAt: action.remindAt,
          note: action.note,
          createdBy: "agent",
        });
      else if (action.type === "export-calendar") {
        const saved = action.taskIds?.length || action.examIds?.length || action.blockIds?.length
          ? await plannerApi.exportCalendar({ deadlineIds: action.deadlineIds, taskIds: action.taskIds, examIds: action.examIds, blockIds: action.blockIds })
          : await api.exportCalendar(action.deadlineIds ?? []);
        if (!saved.saved) { setStatus("idle"); return; }
      } else {
        const result = await plannerApi.approve(proposal.id, action, detail.course.id);
        if (!result.replayed && (action.type === "summarize-course-materials" || action.type === "generate-practice-quiz")) {
          const mode = action.type === "summarize-course-materials" ? "summary" : "quiz";
          setPromptRequest({ text: tr(mode === "summary" ? "planner:run_summary" : "planner:run_quiz"), id: Date.now(), materials: { mode, documentIds: action.documentIds } });
        }
        setSnapshot(await plannerApi.snapshot());
      }
      setActions((current) => current.filter((a) => a.id !== proposal.id));
      await onChange();
      setStatus("done");
    } catch {
      setStatus("idle");
      onError();
    } finally {
      approving.current = false;
    }
  };
  return (
    <Card elevation="none" role="complementary" ref={panel} tabIndex={-1} className="moodle-agent gap-0 py-0" data-conversation={!!conversation} aria-label={tr("moodle:course_assistant")}>
      <Toolbar className="moodle-agent-heading" left={<>
        <Sparkles />
        <h2>{tr("moodle:course_assistant")}</h2>
      </>} />
      <Divider />
      <div className="moodle-agent-body">
        <span className="moodle-agent-symbol">
          <Sparkles />
        </span>
        <h3>{tr("moodle:prepare_title")}</h3>
        <p>{tr("moodle:prepare_description")}</p>
        <div className="moodle-agent-suggestions">
          <Suggestions
            suggestions={[{ id: "explain_prepare", label: tr("moodle:explain_prepare") }]}
            disabled={status === "busy" || (!agent && !conversation)}
            cycle={0}
            variant="list"
            onSuggestion={() => (agent ? void prepare() : quick("explain_prepare"))}
          />
        </div>
        {!agent && (
          <>
            <div className="moodle-agent-suggestions">
              <Suggestions
                suggestions={[
                  { id: "summarize_notifications", label: tr("moodle:summarize_notifications") },
                  { id: "plan_week", label: tr("planner:plan_week") },
                ]}
                disabled={!conversation}
                cycle={0}
                variant="list"
                onSuggestion={quick}
              />
            </div>
            <details className="moodle-study-tools">
              <summary>{tr("courses-art:assistant_tools")}</summary>
              <Suggestions suggestions={[{id:"catch_up",label:tr("planner:catch_up")},{id:"exam_prep",label:tr("planner:exam_prep")}]} disabled={!conversation} cycle={0} variant="list" onSuggestion={quick} />
            <fieldset className="planner-materials">
              <legend>{tr("planner:materials")}</legend>
              <p>{tr("planner:material_hint")}</p>
              {detail.files.filter(f => f.documentId).map(file => <label key={file.id}>
                <input type="checkbox" checked={selectedDocuments.includes(file.documentId!)} disabled={!selectedDocuments.includes(file.documentId!) && selectedDocuments.length >= 6}
                  onChange={e => setSelectedDocuments(current => e.target.checked ? [...current, file.documentId!] : current.filter(id => id !== file.documentId))} />
                {file.name}
              </label>)}
              <div className="planner-actions">{(["summarize-course-materials", "generate-practice-quiz"] as const).map(type => <Button label={(tr(`planner:action_${type}`))} key={type} variant="ghost"  isDisabled={!conversation || !selectedDocuments.length || status === "busy"}
                onClick={() => setActions(current => [...current, { id: crypto.randomUUID(), action: { type, documentIds: selectedDocuments } }])}>{tr(`planner:action_${type}`)}</Button>)}</div>
            </fieldset>
            </details>
            {conversations.length > 0 && (
              <ConversationList current={conversation ?? null} canCreate={!!conversation} onSelect={(c,messageId)=>{setHistoryJump(messageId);void load(c).catch(onError);}} onNew={async()=>{
                if(!conversation)return;
                const c=await desktop.invoke('conversations:create',{scope:'course',courseId:detail.course.id,providerId:conversation.providerId,modelId:conversation.modelId});
                setConversations(list=>[c,...list]);setHistoryJump(undefined);await load(c);
              }}/>
            )}
            {conversation && (
              <div className="moodle-course-chat">
                <Suspense fallback={<p role="status">{tr("common:loading_conversation")}</p>}><Chat
                  key={conversation.id}
                  conversation={conversation}
                  jumpMessageId={historyJump}
                  draft={draft}
                  onDraft={setDraft}
                  history={history.items}
                  historyCursor={history.nextCursor}
                  selection={null}
                  onClearSelection={() => {}}
                  providers={providers}
                  model={`${conversation.providerId}/${conversation.modelId}`}
                  onModel={(value) => {
                    const [providerId, ...parts] = value.split("/");
                    const provider = providers.find(
                      (p) => p.config.id === providerId,
                    );
                    if (!provider) return;
                    void desktop
                      .invoke("conversations:create", {
                        scope: "course",
                        courseId: detail.course.id,
                        providerId: provider.config.id,
                        modelId: parts.join("/"),
                      })
                      .then((c) => {
                        setConversations((current) => [c, ...current]);
                        return load(c);
                      })
                      .catch(onError);
                  }}
                  onSettings={() => {
                    window.dispatchEvent(new CustomEvent("vstudy:open-settings", { detail: { tab: "providers" } }));
                  }}
                  onProvidersChanged={refreshProviders}
                  onUsage={() => {}}
                  documentTitle={detail.course.fullName}
                  onProposals={(next) =>
                    setActions((current) => [...current, ...next.map(action => ({ id: crypto.randomUUID(), action }))])
                  }
                  {...(promptRequest ? { promptRequest } : {})}
                /></Suspense>
              </div>
            )}
          </>
        )}
        {status === "unavailable" && (
          <AiSetupNotice onSettings={() => window.dispatchEvent(new CustomEvent("vstudy:open-settings", { detail: { tab: "providers" } }))} />
        )}
        {status === "done" && (
          <p role="status">
            <Check />
            {tr("moodle:action_done")}
          </p>
        )}
        {actions.map(proposal => <PlannerProposal key={proposal.id} action={proposal.action} snapshot={snapshot} courses={[detail.course]} deadlines={detail.deadlines} files={detail.files}
          busy={status === "busy"} onApprove={() => void approve(proposal)} onDismiss={() => setActions(current => current.filter(item => item.id !== proposal.id))} />)}
      </div>
      {!conversation && <footer>{tr("planner:agent_scope")}</footer>}
    </Card>
  );
}
