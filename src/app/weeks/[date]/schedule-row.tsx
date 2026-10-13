import type { ScheduleEntry } from "@/db/schema";
import { defaultDays, effectiveDays, SELECTABLE_DAYS, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/schedule/days";
import { GROUP_LABELS, type ScheduleGroup } from "@/lib/schedule/rules";
import { formatTimeValue } from "@/lib/time";
import {
  addManualEntry,
  clearEntryOverride,
  deleteManualEntry,
  moveEntry,
  saveEntryOverride,
  toggleEntryDay,
  toggleEntryHidden,
} from "./actions";

/** Up/down arrows to reorder a row within its section. */
function MoveButtons({ entryId, first, last }: { entryId: number; first: boolean; last: boolean }) {
  return (
    <div className="flex flex-col">
      {(["up", "down"] as const).map((dir) => (
        <form key={dir} action={moveEntry}>
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="dir" value={dir} />
          <button
            className="px-1 text-xs leading-3 text-stone-500 hover:text-navy disabled:opacity-20"
            disabled={dir === "up" ? first : last}
            aria-label={`Move ${dir}`}
            title={`Move ${dir}`}
          >
            {dir === "up" ? "▲" : "▼"}
          </button>
        </form>
      ))}
    </div>
  );
}

/** Day toggles (Su Mo Tu We Th) for Sunday–Thursday rows. */
function DayToggles({ entry }: { entry: ScheduleEntry }) {
  const days = effectiveDays(entry);
  // Friday/Shabbos rows keep the same column width so values line up.
  if (!days) return <div className="w-[148px]" aria-hidden="true" />;
  return (
    <div className="flex w-[148px] gap-0.5" aria-label="Days this row applies to">
      {SELECTABLE_DAYS.map((d) => {
        const on = days.includes(d);
        return (
          <form key={d} action={toggleEntryDay}>
            <input type="hidden" name="entryId" value={entry.id} />
            <input type="hidden" name="day" value={d} />
            <button
              aria-pressed={on}
              title={`${on ? "Remove" : "Add"} ${WEEKDAY_NAMES[d]}`}
              className={`w-7 rounded border py-0.5 text-[11px] ${
                on ? "border-navy bg-navy text-white" : "border-stone-300 bg-white text-stone-400 hover:text-stone-700"
              }`}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          </form>
        );
      })}
    </div>
  );
}

/** One davening row: source badge, automatic value, override box and row controls. */
export function ScheduleRow({ entry, first, last }: { entry: ScheduleEntry; first: boolean; last: boolean }) {
  const hasOverride = entry.overrideValue !== null;
  const isManual = entry.source === "manual";

  return (
    <div className={`flex flex-wrap items-center gap-3 py-1.5 ${entry.hidden ? "opacity-50" : ""}`}>
      <MoveButtons entryId={entry.id} first={first} last={last} />
      <div className="w-48">
        <div className="font-medium">{entry.label}</div>
        {entry.note && <div className="text-xs text-stone-500">{entry.note}</div>}
      </div>

      <DayToggles entry={entry} />

      <div className="flex w-48 items-center gap-1.5 text-sm">
        {isManual ? (
          <span className="badge-manual">manual</span>
        ) : entry.autoError ? (
          <span className="badge-error" title={entry.autoError}>
            rule error
          </span>
        ) : (
          <>
            <span className="badge-auto">auto</span>
            <span className={hasOverride ? "text-stone-400 line-through" : ""}>
              {formatTimeValue(entry.autoValue)}
            </span>
          </>
        )}
        {hasOverride && !isManual && <span className="badge-override">override</span>}
      </div>

      <form action={saveEntryOverride} className="flex items-center gap-2">
        <input type="hidden" name="entryId" value={entry.id} />
        <input
          name="value"
          defaultValue={formatTimeValue(entry.overrideValue)}
          placeholder={isManual ? "Time or text" : "Override"}
          className="input w-40"
        />
        <button className="btn btn-sm">Save</button>
      </form>

      <div className="ml-auto flex items-center gap-2">
        {hasOverride && !isManual && (
          <form action={clearEntryOverride}>
            <input type="hidden" name="entryId" value={entry.id} />
            <button className="btn btn-sm" title="Go back to the automatic value">
              Revert to auto
            </button>
          </form>
        )}
        <form action={toggleEntryHidden}>
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="hidden" value={String(!entry.hidden)} />
          <button className="btn btn-sm">{entry.hidden ? "Show" : "Hide this week"}</button>
        </form>
        {isManual && (
          <form action={deleteManualEntry}>
            <input type="hidden" name="entryId" value={entry.id} />
            <button className="btn btn-sm text-red-700">Delete</button>
          </form>
        )}
      </div>
    </div>
  );
}

export function AddEntryForm({ weekId, group }: { weekId: number; group: ScheduleGroup }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-navy">+ Add a row to {GROUP_LABELS[group]} this week</summary>
      <form action={addManualEntry} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="weekId" value={weekId} />
        <input type="hidden" name="group" value={group} />
        <input name="label" required placeholder="e.g. Selichos" className="input w-56" />
        {defaultDays(group) && (
          <span className="flex items-center gap-1 text-xs text-stone-600">
            {SELECTABLE_DAYS.map((d) => (
              <label key={d} className="flex items-center gap-0.5">
                <input type="checkbox" name="day" value={d} defaultChecked={defaultDays(group)!.includes(d)} />
                {WEEKDAY_SHORT[d]}
              </label>
            ))}
          </span>
        )}
        <input name="value" placeholder="e.g. 12:30 AM" className="input w-40" />
        <button className="btn btn-sm">Add</button>
      </form>
    </details>
  );
}
