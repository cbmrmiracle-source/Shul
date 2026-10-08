"use client";

import { useActionState } from "react";
import type { Organization } from "@/db/schema";
import { saveSettings } from "./actions";

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input className="input mt-1 w-full" {...props} />
      {hint && <span className="mt-0.5 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

function RoundSelect({ name, value }: { name: string; value?: string }) {
  return (
    <select name={name} defaultValue={value ?? "nearest"} className="input mt-1 w-full">
      <option value="nearest">Nearest minute</option>
      <option value="floor">Round down</option>
      <option value="ceil">Round up</option>
    </select>
  );
}

export function SettingsForm({ org }: { org: Organization }) {
  const [message, action, pending] = useActionState(saveSettings, null);
  const z = org.zmanim;
  const spellings = Object.entries(org.houseSpellings)
    .map(([a, b]) => `${a} = ${b}`)
    .join("\n");

  return (
    <form action={action} className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-navy">Shul</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" name="name" defaultValue={org.name} required />
          <Field label="Address" name="address" defaultValue={org.address} />
          <Field label="ZIP" name="zip" defaultValue={org.zip} />
          <Field label="Phone" name="phone" defaultValue={org.phone} />
          <Field label="Email" name="email" type="email" defaultValue={org.email} />
          <Field label="Website" name="website" defaultValue={org.website} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-navy">Zmanim</h2>
        <p className="mb-4 text-sm text-stone-500">
          Defaults follow Chabad.org&apos;s regular opinion. Changing these recalculates every week that isn&apos;t final.
          Your overrides are kept.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Latitude" name="latitude" type="number" step="0.0001" defaultValue={z.latitude} required />
          <Field label="Longitude" name="longitude" type="number" step="0.0001" defaultValue={z.longitude} required />
          <Field label="Time zone" name="timezone" defaultValue={z.timezone} required />
          <Field label="Candle lighting (minutes before shkiah)" name="candleLightingMinutes" type="number" defaultValue={z.candleLightingMinutes} required />
          <Field label="Shabbos ends (degrees below horizon)" name="shabbosEndsDegrees" type="number" step="0.01" defaultValue={z.shabbosEndsDegrees} required hint="Chabad.org: 8.5°" />
          <Field label="Weekday tzeis (degrees)" name="tzeisDegrees" type="number" step="0.01" defaultValue={z.tzeisDegrees} required />
          <label className="block">
            <span className="text-sm font-medium">Candle lighting rounding</span>
            <RoundSelect name="roundCandleLighting" value={z.rounding.candleLighting} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Shabbos ends rounding</span>
            <RoundSelect name="roundShabbosEnds" value={z.rounding.shabbosEnds} />
          </label>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-navy">House spellings</h2>
        <p className="mb-3 text-sm text-stone-500">
          Applied to parsha and holiday names. One per line: <code>Bereshis = Bereishis</code>
        </p>
        <textarea name="houseSpellings" defaultValue={spellings} rows={8} className="input w-full font-mono" />
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {message && <span className="text-sm text-stone-600">{message}</span>}
      </div>
    </form>
  );
}
