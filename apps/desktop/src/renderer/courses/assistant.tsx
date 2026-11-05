import { useEffect, useRef, useState, type ComponentProps } from "react";
import { MessageCircle, X } from "lucide-react";
import { tr } from "../../shared/i18n";
import { CourseAgentPanel } from "./agent";

export function CourseAssistant(
  props: ComponentProps<typeof CourseAgentPanel>,
) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const collapse = () => setOpen(false);
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (props.requested) setOpen(true);
  }, [props.requested]);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Tab" &&
        window.matchMedia("(max-width: 760px)").matches
      ) {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            '#course-assistant-panel button, #course-assistant-panel select, #course-assistant-panel textarea, #course-assistant-panel input, #course-assistant-panel [tabindex="0"]',
          ),
        ).filter(
          (element) =>
            element.offsetParent !== null && !element.hasAttribute("disabled"),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector('[data-slot="sheet-content"]')
      ) {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return (
    <div className="moodle-assistant">
      <div
        id="course-assistant-panel"
        className="moodle-assistant-panel"
        hidden={!open}
        role="region"
        aria-label={tr("moodle:course_assistant")}
      >
        <button
          ref={close}
          className="moodle-assistant-close"
          onClick={collapse}
          aria-label={tr("moodle:close_assistant")}
        >
          <X />
        </button>
        <CourseAgentPanel {...props} onPendingChange={setPending} />
      </div>
      <button
        ref={button}
        className="moodle-chat-button"
        onClick={() => (open ? collapse() : setOpen(true))}
        aria-label={tr("moodle:course_assistant")}
        aria-expanded={open}
        aria-controls="course-assistant-panel"
      >
        <MessageCircle />
        {pending && (
          <span
            className="moodle-proposal-dot"
            aria-label={tr("moodle:pending_proposals")}
            role="img"
          />
        )}
      </button>
    </div>
  );
}
