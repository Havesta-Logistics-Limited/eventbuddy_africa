"use client";

import { useEffect, useMemo, useState } from "react";
import { copyText } from "@/lib/copy-text";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { Shell } from "@/components/shell";
import { AuthLoading } from "@/components/auth-loading";
import { useRequireRole } from "@/lib/auth";
import {
  addTourCity,
  applyTourDetails,
  deleteTour,
  getEventSales,
  PersistError,
  removeFromTour,
  updateTour,
  useDataReady,
  useEvents,
  useRegistrations,
  useSession,
  useTicketTypes,
  useTours,
} from "@/lib/store";
import { formatNaira } from "@/lib/billing";
import { getEventStatus } from "@/lib/capture-window";
import { formatTime } from "@/lib/utils";
import type { EventRecord, Role } from "@/lib/types";

const ADMIN_ONLY: Role[] = ["admin"];

function dateParts(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return {
    day: d.getDate(),
    month: d.toLocaleDateString("en-GB", { month: "short" }),
    weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
  };
}

/**
 * Organizer view of a tour: totals across every city, each city's numbers,
 * adding a city (copied from an existing one, with its own date and venue),
 * and pushing shared details (description, form, cover) to every city.
 */
export default function TourPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const tours = useTours();
  const events = useEvents();
  const registrations = useRegistrations();
  const ticketTypes = useTicketTypes();
  const me = useSession();
  const ready = useDataReady();
  const tour = tours.find((t) => t.id === id);

  const cities = useMemo(
    () => events.filter((e) => e.tourId === id).sort((a, b) => (a.date + (a.startTime ?? "")).localeCompare(b.date + (b.startTime ?? ""))),
    [events, id]
  );
  const cityIds = cities.map((c) => c.id).join(",");
  const [sales, setSales] = useState<Record<string, { count: number; gross: number; net: number }>>({});

  useEffect(() => {
    if (!cityIds) return;
    let live = true;
    Promise.all(
      cityIds.split(",").map(async (cid) => {
        const s = await getEventSales(cid).catch(() => []);
        return [cid, { count: s.length, gross: s.reduce((a, x) => a + x.amountNaira, 0), net: s.reduce((a, x) => a + x.netNaira, 0) }] as const;
      })
    ).then((rows) => live && setSales(Object.fromEntries(rows)));
    return () => {
      live = false;
    };
  }, [cityIds]);

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!session) return <AuthLoading />;
  if (!tour) {
    return (
      <Shell>
        <div className="p-8 text-center text-muted">
          {ready ? (
            <>
              <p>Tour not found.</p>
              <Link href="/dashboard" className="mt-2 inline-block text-brand-500">
                ← Back to events
              </Link>
            </>
          ) : (
            <div className="mx-auto h-40 max-w-5xl animate-pulse rounded-2xl bg-fill-strong" />
          )}
        </div>
      </Shell>
    );
  }

  const stats = (e: EventRecord) => {
    const regs = registrations.filter((r) => r.eventId === e.id);
    const active = regs.filter((r) => r.status === "registered" || r.status === "checked_in");
    const tickets = ticketTypes.filter((t) => t.eventId === e.id);
    const paid = tickets.some((t) => t.priceNaira > 0);
    const capacity = tickets.length > 0 && tickets.every((t) => t.quantityAvailable != null) ? tickets.reduce((s, t) => s + (t.quantityAvailable ?? 0), 0) : null;
    return { active: active.length, checkedIn: regs.filter((r) => r.status === "checked_in").length, paid, capacity, sale: sales[e.id] };
  };
  const all = cities.map((c) => ({ city: c, ...stats(c) }));
  const anyPaid = all.some((c) => c.paid);
  const totalPeople = all.reduce((s, c) => s + c.active, 0);
  const totalIn = all.reduce((s, c) => s + c.checkedIn, 0);
  const totalGross = all.reduce((s, c) => s + (c.sale?.gross ?? 0), 0);
  const totalNet = all.reduce((s, c) => s + (c.sale?.net ?? 0), 0);
  const salesLoaded = cities.every((c) => sales[c.id]);

  const publicPath = `/${me?.orgSlug ?? ""}/tours/${tour.slug}`;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : publicPath;

  const cards = [
    { label: "Cities", value: String(cities.length), sub: `${cities.filter((c) => c.published !== false).length} live` },
    { label: anyPaid ? "Tickets sold" : "Registered", value: String(totalPeople), sub: "across every city" },
    anyPaid
      ? { label: "Ticket sales", value: salesLoaded ? formatNaira(totalGross) : "…", sub: salesLoaded ? `${formatNaira(totalNet)} to your balance` : "loading" }
      : { label: "Checked in", value: String(totalIn), sub: totalPeople ? `${Math.round((totalIn / totalPeople) * 100)}% of registered` : "nobody yet" },
  ];

  return (
    <Shell>
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <Link href={cities[0] ? `/events/${cities[0].id}` : "/dashboard"} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft size={14} /> Back
        </Link>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#ff8af5]">Tour</p>
            <h1 className="mt-1 font-display text-2xl text-fg sm:text-3xl">{tour.name}</h1>
            {tour.description && <p className="mt-2 max-w-2xl text-sm text-muted">{tour.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="eb-btn eb-btn--ghost"
              onClick={() => {
                copyText(publicUrl).then(() => {
                  setCopied(true);
                  toast.success("Tour page link copied");
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} Copy tour link
            </button>
            <a href={publicPath} target="_blank" rel="noreferrer" className="eb-btn eb-btn--ghost">
              <ExternalLink size={15} /> View tour page
            </a>
            <button type="button" className="eb-btn eb-btn--ghost" onClick={() => setEditing(true)}>
              Edit tour
            </button>
            <button type="button" className="eb-btn eb-btn--primary" onClick={() => setShowAdd(true)}>
              <Plus size={15} /> Add a city
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="eb-ov-card">
              <p className="eb-ov-label">{c.label}</p>
              <p className="eb-ov-value">{c.value}</p>
              <p className="eb-ov-sub">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="eb-ov-card mt-4">
          <p className="eb-ov-title mb-3">Cities</p>
          {all.length === 0 ? (
            <p className="py-10 text-center text-sm text-subtle">No cities in this tour. Add one to get started.</p>
          ) : (
            <ul className="space-y-2">
              {all.map(({ city, active, checkedIn, paid, capacity, sale }) => {
                const d = dateParts(city.date);
                const status = city.published === false ? "Draft" : getEventStatus(city) === "completed" ? "Ended" : getEventStatus(city) === "active" ? "Happening now" : "On sale";
                return (
                  <li key={city.id} className="eb-ov-row flex-wrap sm:flex-nowrap">
                    <div className="eb-tour-date" aria-hidden="true">
                      <span>{d.month}</span>
                      <strong>{d.day}</strong>
                    </div>
                    <Link href={`/events/${city.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium text-fg">{city.location || city.name}</p>
                      <p className="truncate text-xs text-muted">
                        {d.weekday}
                        {city.startTime ? ` · ${formatTime(city.startTime)}` : ""}
                        {city.venue ? ` · ${city.venue}` : ""}
                      </p>
                    </Link>
                    <div className="text-right text-sm tabular-nums">
                      <p className="font-semibold text-fg">
                        {active}
                        {capacity != null ? <span className="font-normal text-subtle"> / {capacity}</span> : null}
                      </p>
                      <p className="text-xs text-muted">{paid ? (sale ? formatNaira(sale.gross) : "…") : `${checkedIn} checked in`}</p>
                    </div>
                    <span className="eb-tour-status" data-status={status}>
                      {status}
                    </span>
                    <button
                      type="button"
                      title="Take this city out of the tour (the event itself is kept)"
                      aria-label={`Take ${city.location || city.name} out of the tour`}
                      className="rounded-lg p-1.5 text-subtle hover:text-rose-300"
                      onClick={async () => {
                        if (!confirm(`Take ${city.location || city.name} out of this tour? The event, its tickets and attendees are kept.`)) return;
                        try {
                          await removeFromTour(city.id);
                          toast.success("Removed from the tour");
                        } catch {
                          toast.error("Couldn't remove it. Please try again.");
                        }
                      }}
                    >
                      <X size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {cities.length > 1 && <SharedDetails tourId={tour.id} cities={cities} />}

        <div className="mt-8 border-t border-line-soft pt-6">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm text-rose-300 hover:text-rose-200"
            onClick={async () => {
              if (!confirm("Delete this tour? Only the grouping and the tour page go away: every city stays as its own event, with its tickets and attendees.")) return;
              try {
                const first = cities[0]?.id;
                await deleteTour(tour.id);
                toast.success("Tour deleted. The cities are still in your events.");
                router.push(first ? `/events/${first}` : "/dashboard");
              } catch {
                toast.error("Couldn't delete the tour. Please try again.");
              }
            }}
          >
            <Trash2 size={14} /> Delete tour (keeps every city)
          </button>
        </div>
      </div>

      {showAdd && <AddCityModal tourId={tour.id} tourName={tour.name} cities={cities} onClose={() => setShowAdd(false)} />}
      {editing && <EditTourModal id={tour.id} name={tour.name} description={tour.description ?? ""} onClose={() => setEditing(false)} />}
    </Shell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-modal-backdrop sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-6 shadow-2xl animate-modal-panel sm:max-w-lg sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-fg">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddCityModal({ tourId, tourName, cities, onClose }: { tourId: string; tourName: string; cities: EventRecord[]; onClose: () => void }) {
  const router = useRouter();
  const last = cities[cities.length - 1];
  // "Afrobeats Live · Abuja": the first city's own name, without any city suffix
  const baseName = (cities[0]?.name ?? tourName).split(" · ")[0];
  const [form, setForm] = useState({ city: "", venue: "", date: "", startTime: last?.startTime ?? "", endTime: last?.endTime ?? "", source: last?.id ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.city.trim() || !form.venue.trim() || !form.date) return setError("Add the city, venue and date.");
    if (!form.source) return setError("Pick a city to copy the setup from.");
    setError("");
    setSaving(true);
    try {
      const created = await addTourCity(tourId, form.source, {
        name: `${baseName} · ${form.city.trim()}`,
        location: form.city.trim(),
        venue: form.venue.trim(),
        date: form.date,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
      });
      toast.success(`${form.city.trim()} added as a draft. Check its ticket quantities, then publish.`);
      if (created) router.push(`/events/${created.id}`);
      else onClose();
    } catch (err) {
      setError(err instanceof PersistError ? err.message : "Couldn't add this city. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Add a city" onClose={() => !saving && onClose()}>
      <form onSubmit={submit}>
        <p className="mb-5 text-sm text-muted">
          The new city copies the description, cover, form questions, ticket types and discount codes. It starts as a draft so you can adjust ticket quantities before it goes live.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tc-city" className="eb-label eb-req">City</label>
            <input id="tc-city" className="eb-input" placeholder="Abuja" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} autoFocus />
          </div>
          <div>
            <label htmlFor="tc-venue" className="eb-label eb-req">Venue</label>
            <input id="tc-venue" className="eb-input" placeholder="Eagle Square" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="tc-date" className="eb-label eb-req">Date</label>
            <input id="tc-date" type="date" className="eb-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label htmlFor="tc-start" className="eb-label">Starts</label>
            <input id="tc-start" type="time" className="eb-input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          </div>
          <div>
            <label htmlFor="tc-end" className="eb-label">Ends</label>
            <input id="tc-end" type="time" className="eb-input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
          {cities.length > 1 && (
            <div className="sm:col-span-2">
              <label htmlFor="tc-source" className="eb-label">Copy the setup from</label>
              <select id="tc-source" className="eb-input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.location || c.name} ({c.date})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {error && <p className="eb-alert mt-4" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="eb-btn eb-btn--ghost">Cancel</button>
          <button type="submit" disabled={saving} className="eb-btn eb-btn--primary">{saving ? "Adding…" : "Add city"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditTourModal({ id, name, description, onClose }: { id: string; name: string; description: string; onClose: () => void }) {
  const [form, setForm] = useState({ name, description });
  const [saving, setSaving] = useState(false);
  return (
    <Modal title="Edit tour" onClose={() => !saving && onClose()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.name.trim()) return;
          setSaving(true);
          try {
            await updateTour(id, form);
            toast.success("Tour updated");
            onClose();
          } catch {
            toast.error("Couldn't save. Please try again.");
            setSaving(false);
          }
        }}
      >
        <label htmlFor="et-name" className="eb-label eb-req">Tour name</label>
        <input id="et-name" className="eb-input" maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label htmlFor="et-desc" className="eb-label mt-4">Intro for the tour page</label>
        <textarea id="et-desc" rows={4} className="eb-input" placeholder="One night, five cities…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="eb-btn eb-btn--ghost">Cancel</button>
          <button type="submit" disabled={saving || !form.name.trim()} className="eb-btn eb-btn--primary">{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

function SharedDetails({ tourId, cities }: { tourId: string; cities: EventRecord[] }) {
  const [source, setSource] = useState(cities[0].id);
  const [cover, setCover] = useState(true);
  const [busy, setBusy] = useState(false);
  const src = cities.find((c) => c.id === source) ?? cities[0];
  return (
    <div className="eb-ov-card mt-4">
      <p className="eb-ov-title">Update every city at once</p>
      <p className="mt-1 text-sm text-muted">
        Copies the description, form questions and category (and the cover, if ticked) from one city to all the others. Dates, venues, tickets and stock aren&apos;t touched.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="sd-source" className="eb-label">Copy from</label>
          <select id="sd-source" className="eb-input" value={source} onChange={(e) => setSource(e.target.value)}>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.location || c.name} ({c.date})
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-fg-3">
          <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} /> Include the cover image
        </label>
        <button
          type="button"
          disabled={busy}
          className="eb-btn eb-btn--primary"
          onClick={async () => {
            if (!confirm(`Copy ${src.location || src.name}'s details to the other ${cities.length - 1} cities? Their current descriptions${cover ? ", covers" : ""} and form questions will be replaced.`)) return;
            setBusy(true);
            try {
              const n = await applyTourDetails(tourId, src.id, { cover });
              toast.success(`Updated ${n} ${n === 1 ? "city" : "cities"}`);
            } catch {
              toast.error("Couldn't update every city. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Updating…" : "Apply to all cities"}
        </button>
      </div>
    </div>
  );
}
