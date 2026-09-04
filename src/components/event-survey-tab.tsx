"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Download } from "lucide-react";
import { EventRecord, FieldDef } from "@/lib/types";
import { PersistError, updateEvent } from "@/lib/store";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FieldBuilderStep } from "@/components/event-wizard/steps/field-builder-step";
import { downloadCsv, surveyResponsesToCsv } from "@/lib/csv";

type SurveyResponse = { id: string; answers: Record<string, string | string[]>; createdAt: string };

/** The organizer side of post-event surveys — define questions (same FieldDef
 *  builder the registration form uses), toggle whether the Hub shows a Survey tab
 *  once the event ends, and see what came back. Responses are read straight from
 *  event_survey_responses via RLS (this org already owns them), not through an API
 *  route — submitting one is the only part that needs the service-role client
 *  (see /api/orgs/[slug]/events/[eventId]/hub/survey), not reading them back. */
export function SurveyTab({ event }: { event: EventRecord }) {
  const [fields, setFields] = useState<FieldDef[]>(event.surveyFields ?? []);
  const [enabled, setEnabled] = useState(!!event.surveyEnabled);
  const [savingFields, setSavingFields] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [responses, setResponses] = useState<SurveyResponse[] | null>(null);
  const fieldsDirty = JSON.stringify(fields) !== JSON.stringify(event.surveyFields ?? []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("event_survey_responses")
      .select("id, answers, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setResponses((data ?? []).map((r) => ({ id: r.id, answers: r.answers, createdAt: r.created_at }))));
  }, [event.id]);

  async function handleToggle() {
    setTogglingEnabled(true);
    try {
      await updateEvent(event.id, { surveyEnabled: !enabled });
      setEnabled((v) => !v);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't update this setting.");
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function saveFields() {
    setSavingFields(true);
    try {
      await updateEvent(event.id, { surveyFields: fields });
      toast.success("Survey questions saved");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't save these questions.");
    } finally {
      setSavingFields(false);
    }
  }

  function exportResponses() {
    if (!responses || responses.length === 0) return;
    downloadCsv(`${event.name.replace(/[^a-z0-9]/gi, "_")}_survey_responses.csv`, surveyResponsesToCsv(responses, fields));
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ClipboardList size={16} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">Post-event survey</p>
              <p className="text-xs text-slate-500">Shows a Survey tab on the Event Hub once this event has ended.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={togglingEnabled}
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${enabled ? "bg-brand-600" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : ""}`} />
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Questions</h3>
        <FieldBuilderStep fields={fields} onChange={setFields} />
        {fieldsDirty && (
          <button
            type="button"
            onClick={saveFields}
            disabled={savingFields}
            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
          >
            {savingFields ? "Saving…" : "Save questions"}
          </button>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Responses</h3>
          {responses && responses.length > 0 && (
            <button
              onClick={exportResponses}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Download size={12} />
              Export
            </button>
          )}
        </div>
        {responses === null ? (
          <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
        ) : responses.length === 0 || fields.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-sm">{fields.length === 0 ? "Add a question above to start collecting responses." : "No responses yet."}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {["Submitted", ...fields.map((f) => f.label || "Untitled")].map((h, i) => (
                      <th key={i} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {responses.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("en-GB")}</td>
                      {fields.map((f) => {
                        const v = r.answers[f.id];
                        return (
                          <td key={f.id} className="px-4 py-3 text-slate-600 max-w-[200px] truncate">
                            {(Array.isArray(v) ? v.join(", ") : v) || "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
