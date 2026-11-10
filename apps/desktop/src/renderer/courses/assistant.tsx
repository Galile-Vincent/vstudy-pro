import { IconButton } from "@astryxdesign/core";
import { LayoutPanel, Button } from "@astryxdesign/core";
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
            element.offsetParent !== null && !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true",
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
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return (
    <div className="moodle-assistant" data-open={open}>
      <LayoutPanel hasDivider width="100%"
        id="course-assistant-panel"
        className="moodle-assistant-panel gap-0 py-0"
        hidden={!open}
        role="region"
        aria-label={tr("moodle:course_assistant")}
      >
        <IconButton label={tr("moodle:close_assistant")} variant="ghost"  size="md"
          ref={close}
          className="moodle-assistant-close"
          onClick={collapse}
          aria-label={tr("moodle:close_assistant")} icon={<X />} />
        <CourseAgentPanel {...props} onPendingChange={setPending} />
      </LayoutPanel>
      <Button icon={<MessageCircle />} label={tr("moodle:course_assistant")}
        ref={button}
        className="moodle-chat-button"
        onClick={() => (open ? collapse() : setOpen(true))}
        aria-label={tr("moodle:course_assistant")}
        aria-expanded={open}
        aria-controls="course-assistant-panel"
      >
        <span>{tr("moodle:course_assistant")}</span>
        {pending && (
          <span
            className="moodle-proposal-dot"
            aria-label={tr("moodle:pending_proposals")}
            role="img"
          />
        )}
      </Button>
    </div>
  );
}
