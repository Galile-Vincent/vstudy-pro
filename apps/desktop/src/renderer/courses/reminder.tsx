import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import type { MoodleDeadline, MoodleReminder } from "../../shared/moodle";
import { tr } from "../../shared/i18n";
import { Button } from "../components/ui/button";
import { Input, FormField, ListRow } from "../components/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import type { MoodleApi } from "./api";

export function Reminder({
  deadline,
  reminders,
  api,
  onChange,
  onError,
}: {
  deadline: MoodleDeadline;
  reminders: MoodleReminder[];
  api: MoodleApi;
  onChange: () => Promise<void>;
  onError: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const existing = reminders.filter(
    (r) => r.deadlineId === deadline.id && !r.fired,
  );
  const save = async (time: number) => {
    if (!Number.isFinite(time) || time <= Date.now()) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    try {
      await api.createReminder({
        deadlineId: deadline.id,
        remindAt: new Date(time).toISOString(),
        note,
      });
      await onChange();
      setOpen(false);
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="moodle-reminder-trigger"
          data-active={existing.length > 0}
          size="icon"
          aria-label={tr("moodle:remind_for", { title: deadline.title })}
        >
          {existing.length ? <BellRing /> : <Bell />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="moodle-reminder" align="end">
        <h3>{tr("moodle:set_reminder")}</h3>
        <p>{deadline.title}</p>
        <div className="moodle-presets">
          {[1, 24, 72].map((hours) => (
            <Button
              key={hours}
              variant="outline"
              disabled={
                busy ||
                Date.parse(deadline.dueAt) - hours * 3600000 <= Date.now()
              }
              onClick={() =>
                void save(Date.parse(deadline.dueAt) - hours * 3600000)
              }
            >
              {tr(`moodle:before_${hours}`)}
            </Button>
          ))}
        </div>
        <FormField error={invalid ? tr("moodle:future_time") : undefined} label={tr("moodle:custom_time")} children={field => <Input {...field}
            type="datetime-local"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setInvalid(false);
            }}
          />} />
        <FormField label={tr("moodle:note")} children={field => <Input {...field}
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />} />
        <Button
          disabled={busy || !custom}
          onClick={() => void save(new Date(custom).getTime())}
        >
          {tr("moodle:save_reminder")}
        </Button>
        {existing.map((r) => (
          <ListRow key={r.id} title={<>
            <time dateTime={r.remindAt}>
              {new Date(r.remindAt).toLocaleString(
                document.documentElement.lang || "en",
              )}
            </time>
            </>} actions={<Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.deleteReminder(r.id);
                  await onChange();
                } catch {
                  onError();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("moodle:remove")}
            </Button>} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
