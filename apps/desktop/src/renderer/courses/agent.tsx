import { useState } from "react";
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

// TODO: Supply a course-scoped chat transport. The existing Chat requires a document conversation.
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
            Date.parse(action.remindAt) <= Date.now()
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
    setStatus("busy");
    try {
      if (action.type === "create-reminder")
        await api.createReminder({
          deadlineId: action.deadlineId,
          remindAt: action.remindAt,
          note: action.note,
        });
      else await api.exportCalendar(action.deadlineIds);
      setActions((current) => current.filter((a) => a !== action));
      await onChange();
      setStatus("done");
    } catch {
      setStatus("idle");
      onError();
    }
  };
  return (
    <aside className="moodle-agent" aria-label={tr("moodle:course_assistant")}>
      <div className="moodle-agent-heading">
        <Sparkles />
        <h2>{tr("moodle:course_assistant")}</h2>
        <span className="moodle-chip">{tr("moodle:preview")}</span>
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
          onClick={() => void prepare()}
        >
          {tr("moodle:explain_prepare")}
        </Button>
        {(status === "unavailable" || requested > 0) && (
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
                    date: new Date(action.remindAt).toLocaleString(i18n.resolvedLanguage),
                  })
                : tr("moodle:calendar_proposal", {
                    count: action.deadlineIds.length,
                  })}
            </p>
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
