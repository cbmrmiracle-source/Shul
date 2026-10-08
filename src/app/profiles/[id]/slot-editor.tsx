"use client";

import { keepFormOnSubmit } from "@/components/use-keep-form";
import { useActionState, useState } from "react";
import type { ScheduleProfile, ScheduleSlot } from "@/db/schema";
import { ZMAN_KEYS, ZMAN_LABELS } from "@/lib/calendar/zman-keys";
import { describeRule, GROUP_LABELS, SCHEDULE_GROUPS, type ScheduleGroup, type ScheduleRule } from "@/lib/schedule/rules";
import { formatTimes } from "@/lib/time";
import { addSlot, deleteSlot, moveSlot, saveProfile, saveSlot } from "../actions";

type SlotOption = { key: string; label: string };

const KIND_LABELS: Record<ScheduleRule["kind"], string> = {
  fixed: "Fixed time(s)",
  zman: "Based on a zman",
  relative: "Based on another row",
  text: "Text",
};

function RuleFields({ rule, slotOptions }: { rule?: ScheduleRule; slotOptions: SlotOption[] }) {
  const [kind, setKind] = useState<ScheduleRule["kind"]>(rule?.kind ?? "fixed");
  const offset = rule && "offset" in rule ? rule.offset : 0;
  const round = rule && "round" in rule ? rule.round : "none";
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="text-xs text-stone-500">Rule</span>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as ScheduleRule["kind"])} className="input block">
          {Object.entries(KIND_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {kind === "fixed" && (
        <label className="block">
          <span className="text-xs text-stone-500">Time(s)</span>
          <input
            name="times"
            defaultValue={rule?.kind === "fixed" ? formatTimes(rule.times) : ""}
            placeholder="6:30 / 7:30AM"
            className="input block w-40"
          />
        </label>
      )}
      {kind === "text" && (
        <label className="block">
          <span className="text-xs text-stone-500">Text</span>
          <input name="text" defaultValue={rule?.kind === "text" ? rule.text : ""} placeholder="B'zman" className="input block w-40" />
        </label>
      )}
      {kind === "zman" && (
        <label className="block">
          <span className="text-xs text-stone-500">Zman</span>
          <select name="zman" defaultValue={rule?.kind === "zman" ? rule.zman : "sunset"} className="input block">
            {ZMAN_KEYS.map((k) => (
              <option key={k} value={k}>
                {ZMAN_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "relative" && (
        <label className="block">
          <span className="text-xs text-stone-500">Row</span>
          <select name="slotKey" defaultValue={rule?.kind === "relative" ? rule.slotKey : ""} className="input block">
            <option value="">Choose…</option>
            {slotOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {(kind === "zman" || kind === "relative") && (
        <>
          <label className="block">
            <span className="text-xs text-stone-500">± minutes</span>
            <input name="offset" type="number" defaultValue={offset} className="input block w-20" />
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">Rounding</span>
            <select name="round" defaultValue={round} className="input block">
              <option value="none">Exact minute</option>
              <option value="down5">Down to 5</option>
              <option value="up5">Up to 5</option>
              <option value="nearest5">Nearest 5</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}

function Result({ state }: { state: { error?: string; ok?: string } | null }) {
  if (!state) return null;
  return <span className={`text-xs ${state.error ? "text-red-700" : "text-green-700"}`}>{state.error ?? state.ok}</span>;
}

export function SlotEditor({ slot, slotOptions }: { slot: ScheduleSlot; slotOptions: SlotOption[] }) {
  const [state, action, pending] = useActionState(saveSlot, null);
  const [editing, setEditing] = useState(false);
  const labelFor = Object.fromEntries(slotOptions.map((o) => [o.key, o.label]));
  const summary = describeRule(slot.rule, ZMAN_LABELS).replace(/\[(\w+)\]/, (_, k) => labelFor[k] ?? k);

  return (
    <div className="px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-56 font-medium">{slot.label}</span>
        <span className="text-sm text-stone-600">{summary}</span>
        {slot.note && <span className="text-xs text-stone-500">({slot.note})</span>}
        <div className="ml-auto flex gap-1">
          <form action={moveSlot}>
            <input type="hidden" name="slotId" value={slot.id} />
            <input type="hidden" name="dir" value="up" />
            <button className="btn btn-sm" aria-label="Move up">↑</button>
          </form>
          <form action={moveSlot}>
            <input type="hidden" name="slotId" value={slot.id} />
            <input type="hidden" name="dir" value="down" />
            <button className="btn btn-sm" aria-label="Move down">↓</button>
          </form>
          <button className="btn btn-sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-3">
          <form onSubmit={keepFormOnSubmit(action)} className="space-y-2">
            <input type="hidden" name="slotId" value={slot.id} />
            <div className="flex flex-wrap gap-2">
              <input name="label" defaultValue={slot.label} required className="input w-56" />
              <select name="group" defaultValue={slot.group} className="input">
                {SCHEDULE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
              <input name="note" defaultValue={slot.note} placeholder="Note (optional)" className="input w-56" />
            </div>
            <RuleFields rule={slot.rule} slotOptions={slotOptions} />
            <div className="flex items-center gap-2">
              <button className="btn-primary btn-sm" disabled={pending}>
                Save
              </button>
              <Result state={state} />
            </div>
          </form>
          <form
            action={deleteSlot}
            onSubmit={(e) => {
              if (!confirm(`Delete "${slot.label}" from this profile?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="slotId" value={slot.id} />
            <button className="btn btn-sm text-red-700">Delete row</button>
          </form>
        </div>
      )}
    </div>
  );
}

export function NewSlotForm({ profileId, group, slotOptions }: { profileId: number; group: ScheduleGroup; slotOptions: SlotOption[] }) {
  const [state, action, pending] = useActionState(addSlot, null);
  return (
    <details className="border-t border-stone-100 px-4 py-2">
      <summary className="cursor-pointer text-xs text-navy">+ Add a row</summary>
      <form onSubmit={keepFormOnSubmit(action)} className="mt-2 space-y-2">
        <input type="hidden" name="profileId" value={profileId} />
        <input type="hidden" name="group" value={group} />
        <div className="flex flex-wrap gap-2">
          <input name="label" required placeholder="Label, e.g. Mincha" className="input w-56" />
          <input name="note" placeholder="Note (optional)" className="input w-56" />
        </div>
        <RuleFields slotOptions={slotOptions} />
        <div className="flex items-center gap-2">
          <button className="btn-primary btn-sm" disabled={pending}>
            Add
          </button>
          <Result state={state} />
        </div>
      </form>
    </details>
  );
}

export function ProfileForm({ profile }: { profile: ScheduleProfile }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  return (
    <form onSubmit={keepFormOnSubmit(action)} className="card flex flex-wrap items-end gap-3 p-5">
      <input type="hidden" name="profileId" value={profile.id} />
      <label className="block">
        <span className="text-sm font-medium">Profile name</span>
        <input name="name" defaultValue={profile.name} required className="input mt-1 block w-56" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Active from</span>
        <input name="activeFrom" type="date" defaultValue={profile.activeFrom ?? ""} className="input mt-1 block" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Active to</span>
        <input name="activeTo" type="date" defaultValue={profile.activeTo ?? ""} className="input mt-1 block" />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input name="isDefault" type="checkbox" defaultChecked={profile.isDefault} /> Default
      </label>
      <button className="btn-primary" disabled={pending}>
        Save
      </button>
      <Result state={state} />
    </form>
  );
}
