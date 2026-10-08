import type { ScheduleEntry } from "@/db/schema";
import { GROUP_LABELS, type ScheduleGroup } from "@/lib/schedule/rules";
import { formatTimeValue } from "@/lib/time";
import {
  addManualEntry,
  clearEntryOverride,
  deleteManualEntry,
  saveEntryOverride,
  toggleEntryHidden,
} from "./actions";

/** One davening row: source badge, automatic value, override box and row controls. */
export function ScheduleRow({ entry }: { entry: ScheduleEntry }) {
  const hasOverride = entry.overrideValue !== null;
  const isManual = entry.source === "manual";

  return (
    <div className={`flex flex-wrap items-center gap-3 py-1.5 ${entry.hidden ? "opacity-50" : ""}`}>
      <div className="w-56">
        <div className="font-medium">{entry.label}</div>
        {entry.note && <div className="text-xs text-stone-500">{entry.note}</div>}
      </div>

      <div className="flex w-56 items-center gap-1.5 text-sm">
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
        <input name="value" placeholder="e.g. 12:30 AM" className="input w-40" />
        <button className="btn btn-sm">Add</button>
      </form>
    </details>
  );
}
