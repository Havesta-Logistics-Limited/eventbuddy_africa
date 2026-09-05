"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Edit2, X } from "lucide-react";
import { EventRecord } from "@/lib/types";
import { PersistError, updateEvent } from "@/lib/store";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Edits events.slug — the one custom link an event has, shared by both the
 *  register link (/discover/[slug]) and, since it's shorter and more readable
 *  than the raw event id, the staff/rep check-in links too (see
 *  CheckinLinksCard). Rendered in more than one place on the event page (the
 *  registration card up top, the Check-in links card in its own tab) since an
 *  organizer editing it from either one should see the same result — self-
 *  contained rather than lifted into shared page state, so each instance owns
 *  its own edit/save UI but they all write the same field. */
export function EventSlugEditor({ event }: { event: EventRecord }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const cleaned = slugify(input);
    setSaving(true);
    setError("");
    try {
      // `cleaned` is always a real string here (never undefined) specifically so
      // eventToRow's `!== undefined` check fires and an empty value actually nulls
      // the column out — passing undefined would make it skip the field entirely,
      // silently failing to clear a previously-set custom link.
      await updateEvent(event.id, { slug: cleaned });
      setEditing(false);
      toast.success(cleaned ? "Custom link saved" : "Custom link removed");
    } catch (err) {
      const code = err instanceof PersistError && err.cause && typeof err.cause === "object" && "code" in err.cause ? (err.cause as { code?: string }).code : undefined;
      setError(code === "23505" ? "This link is already taken — try another." : err instanceof PersistError ? err.message : "Couldn't save this link.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setInput(event.slug ?? "");
          setEditing(true);
        }}
        className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-brand-600"
      >
        <Edit2 size={10} />
        {event.slug ? "Edit custom link" : "Customize this link"}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">eventbuddy.africa/discover/</span>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="your-event-name"
          className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <button type="button" onClick={handleSave} disabled={saving} className="p-1.5 rounded-lg text-emerald-600 border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50 shrink-0">
          <Check size={13} />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError("");
          }}
          className="p-1.5 rounded-lg text-slate-500 border border-slate-200 hover:bg-slate-50 shrink-0"
        >
          <X size={13} />
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">Leave blank to use the default link. Letters, numbers, and dashes only.</p>
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
