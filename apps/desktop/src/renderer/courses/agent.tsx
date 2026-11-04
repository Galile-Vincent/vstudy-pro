import { useEffect, useRef, useState } from "react";
import { desktop } from "../bridge";
import { Chat } from "../chat";
import type { Conversation, Message } from "../../shared/domain";
import type { Providers } from "../providers";
import { Check, Sparkles } from "lucide-react";
import type {
  MoodleAgentAction,
  MoodleCourseDetail,
} from "../../shared/moodle";
import { moodleAgentActionSchema } from "../../shared/moodle";
import { tr, i18n } from "../../shared/i18n";
import { Button } from "../components/ui/button";
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
}: {
  detail: MoodleCourseDetail;
  api: MoodleApi;
  agent?: CourseAgent | undefined;
  requested: number;
  onChange: () => Promise<void>;
  onError: () => void;
}) {
  const approving = useRef(false);
  const handledRequest = useRef(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation>();
  const [history, setHistory] = useState<Message[]>([]);
  const [providers, setProviders] = useState<Providers>([]);
  const [draft, setDraft] = useState("");
  const [promptRequest, setPromptRequest] = useState<{
    text: string;
    id: number;
  }>();
  const refreshProviders = async () => {
    setProviders(await desktop.invoke("providers:list", { discover: true }));
  };
  const load = async (c: Conversation) => {
    const messages = await desktop.invoke("messages:list", {
      conversationId: c.id,
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
        if (c) await load(c);
        else setStatus("unavailable");
      })
      .catch(() => {
        if (live) setStatus("unavailable");
      });
    return () => {
      live = false;
    };
  }, [detail.course.id, agent]);
  const quick = (key: string) => {
    setPromptRequest({ text: tr(`moodle:${key}`), id: Date.now() });
  };
  useEffect(() => {
    if (requested > handledRequest.current && conversation) {
      handledRequest.current = requested;
      quick("explain_prepare");
    }
  }, [requested, conversation?.id]);
  const [actions, setActions] = useState<MoodleAgentAction[]>([]);
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
          const ids =
            action.type === "create-reminder"
              ? [action.deadlineId]
              : action.deadlineIds;
          if (
            ids.some(
              (id) => !detail.deadlines.some((deadline) => deadline.id === id),
            )
          )
            throw new Error("Action outside course scope");
          if (
            action.type === "create-reminder" &&
            (Date.parse(action.remindAt) <= Date.now() ||
              Date.parse(action.remindAt) >=
                Date.parse(
                  detail.deadlines.find((d) => d.id === action.deadlineId)!
                    .dueAt,
                ))
          )
            throw new Error("Reminder must be in the future");
          return action;
        }),
      );
      setStatus("idle");
    } catch {
      setStatus("idle");
      onError();
    }
  };
  const approve = async (action: MoodleAgentAction) => {
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
      else if (!(await api.exportCalendar(action.deadlineIds)).saved) { setStatus("idle"); return; }
      setActions((current) => current.filter((a) => a !== action));
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
    <aside className="moodle-agent" aria-label={tr("moodle:course_assistant")}>
      <div className="moodle-agent-heading">
        <Sparkles />
        <h2>{tr("moodle:course_assistant")}</h2>
      </div>
      <div className="moodle-agent-body">
        <span className="moodle-agent-symbol">
          <Sparkles />
        </span>
        <h3>{tr("moodle:prepare_title")}</h3>
        <p>{tr("moodle:prepare_description")}</p>
        <Button
          variant="outline"
          disabled={status === "busy"}
          onClick={() => (agent ? void prepare() : quick("explain_prepare"))}
        >
          {tr("moodle:explain_prepare")}
        </Button>
        {!agent && (
          <>
            <Button
              variant="outline"
              disabled={!conversation}
              onClick={() => quick("summarize_notifications")}
            >
              {tr("moodle:summarize_notifications")}
            </Button>
            <Button
              variant="outline"
              disabled={!conversation}
              onClick={() => quick("plan_week")}
            >
              {tr("moodle:plan_week")}
            </Button>
            {conversations.length > 0 && (
              <select
                aria-label={tr("moodle:conversations")}
                value={conversation?.id ?? ""}
                onChange={(e) => {
                  const c = conversations.find((c) => c.id === e.target.value);
                  if (c) void load(c).catch(onError);
                }}
              >
                {conversations.map((c, i) => (
                  <option key={c.id} value={c.id}>
                    {tr("moodle:conversation_number", { number: i + 1 })}
                  </option>
                ))}
              </select>
            )}
            {conversation && (
              <div className="moodle-course-chat">
                <Chat
                  key={conversation.id}
                  conversation={conversation}
                  draft={draft}
                  onDraft={setDraft}
                  history={history}
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
                    setStatus("unavailable");
                  }}
                  onProvidersChanged={refreshProviders}
                  onUsage={() => {}}
                  documentTitle={detail.course.fullName}
                  onProposals={(next) =>
                    setActions((current) => [...current, ...next])
                  }
                  {...(promptRequest ? { promptRequest } : {})}
                />
              </div>
            )}
          </>
        )}
        {status === "unavailable" && (
          <p role="status">{tr("moodle:agent_unavailable")}</p>
        )}
        {status === "done" && (
          <p role="status">
            <Check />
            {tr("moodle:action_done")}
          </p>
        )}
        {actions.map((action, index) => (
          <div className="moodle-proposal" key={index}>
            <h3>{tr("moodle:confirm_action")}</h3>
            <p>
              {action.type === "create-reminder"
                ? tr("moodle:reminder_proposal", {
                    title:
                      detail.deadlines.find((d) => d.id === action.deadlineId)
                        ?.title ?? "",
                    date: new Date(action.remindAt).toLocaleString(
                      i18n.resolvedLanguage,
                    ),
                  })
                : tr("moodle:calendar_proposal", {
                    count: action.deadlineIds.length,
                  })}
            </p>
            {action.type === "export-calendar" && (
              <ul>
                {action.deadlineIds.map((id) => {
                  const deadline = detail.deadlines.find((d) => d.id === id);
                  return deadline ? (
                    <li key={id}>
                      {deadline.title} ·{" "}
                      {new Date(deadline.dueAt).toLocaleString(
                        i18n.resolvedLanguage,
                      )}
                    </li>
                  ) : null;
                })}
              </ul>
            )}
            {action.type === "create-reminder" && <p>{action.note}</p>}
            <Button
              disabled={status === "busy"}
              onClick={() => void approve(action)}
            >
              {tr("moodle:approve")}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setActions((current) => current.filter((a) => a !== action))
              }
            >
              {tr("moodle:dismiss")}
            </Button>
          </div>
        ))}
      </div>
      <footer>{tr("moodle:agent_scope")}</footer>
    </aside>
  );
}
