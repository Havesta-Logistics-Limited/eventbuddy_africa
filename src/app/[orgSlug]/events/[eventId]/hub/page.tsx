"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, BarChart3, Bookmark, BookmarkCheck, Calendar, Loader2, Megaphone, Mic2, Pin, Send, ThumbsUp } from "lucide-react";
import { formatDate, formatTime } from "@/lib/utils";

type HubSession = {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  track: string | null;
  sessionType: string;
  qaOpen: boolean;
  speakers: { assignmentId: string; speakerId: string; name: string; photoUrl: string | null; role: string }[];
  bookmarked: boolean;
};
type HubSpeaker = { id: string; name: string; title: string | null; company: string | null; bio: string | null; photoUrl: string | null };
type HubQuestion = {
  id: string;
  sessionId: string | null;
  speakerId: string | null;
  askedByName: string;
  questionText: string;
  status: string;
  upvoteCount: number;
  hasUpvoted: boolean;
  createdAt: string;
};
type HubAnnouncement = { id: string; body: string; pinned: boolean; createdAt: string };
type HubPollOption = { id: string; label: string; voteCount: number };
type HubPoll = { id: string; question: string; status: string; myOptionId: string | null; options: HubPollOption[] };
type HubData = {
  event: { id: string; name: string; date: string; eventFormat: string };
  attendeeName: string;
  sessions: HubSession[];
  speakers: HubSpeaker[];
  questions: HubQuestion[];
  announcements: HubAnnouncement[];
  polls: HubPoll[];
};

type Section = "schedule" | "speakers" | "qa" | "polls" | "announcements";

/** Public, no-session Event Hub — reached only via the link mailed at registration
 *  (the ?token query param is the whole trust boundary, same as a reference_id).
 *  Polls rather than using Realtime for v1: simple, robust, and indistinguishable
 *  from "live" at conference scale — see the Event Hub build plan. */
export default function EventHubPage() {
  const params = useParams<{ orgSlug: string; eventId: string }>();
  const { orgSlug, eventId } = params;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<HubData | null>(null);
  const [section, setSection] = useState<Section>("schedule");
  const [myAgendaOnly, setMyAgendaOnly] = useState(false);

  const [questionText, setQuestionText] = useState("");
  const [targetSessionId, setTargetSessionId] = useState("");
  const [targetSpeakerId, setTargetSpeakerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh(showSpinner: boolean) {
    if (!token) {
      setLoadError("Missing access link — check your confirmation email for the right one.");
      setLoading(false);
      return;
    }
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/hub?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error || "Couldn't load this event's hub.");
        return;
      }
      setData(json as HubData);
      setLoadError("");
    } catch {
      setLoadError("Couldn't load this event's hub. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(true);
    const id = setInterval(() => refresh(false), 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, eventId, token]);

  async function handleSubmitQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!questionText.trim()) {
      setSubmitError("Enter a question.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/hub/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, questionText: questionText.trim(), sessionId: targetSessionId || undefined, speakerId: targetSpeakerId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || "Couldn't submit your question.");
        return;
      }
      setQuestionText("");
      setTargetSessionId("");
      setTargetSpeakerId("");
      toast.success("Question sent — it'll appear here once the moderator approves it.");
      refresh(false);
    } catch {
      setSubmitError("Couldn't submit your question. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpvote(questionId: string) {
    setBusyId(questionId);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/hub/questions/${questionId}/upvote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || "Couldn't record your vote.");
        return;
      }
      refresh(false);
    } catch {
      toast.error("Couldn't record your vote.");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePollVote(pollId: string, optionId: string) {
    setBusyId(pollId);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/hub/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, optionId }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || "Couldn't submit your vote.");
        return;
      }
      refresh(false);
    } catch {
      toast.error("Couldn't submit your vote.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBookmark(sessionId: string) {
    setBusyId(sessionId);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(eventId)}/hub/sessions/${sessionId}/bookmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || "Couldn't update your agenda.");
        return;
      }
      refresh(false);
    } catch {
      toast.error("Couldn't update your agenda.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (loadError || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500 max-w-sm">
          <AlertCircle size={28} className="mx-auto mb-3 text-slate-300" />
          <p>{loadError || "Couldn't load this event's hub."}</p>
        </div>
      </div>
    );
  }

  const { event, sessions, speakers, questions, announcements, polls } = data;
  const speakerById = new Map(speakers.map((s) => [s.id, s]));
  const openSessions = sessions.filter((s) => s.qaOpen);
  const qaAvailable = openSessions.length > 0;
  const sessionSpeakerOptions = targetSessionId ? sessions.find((s) => s.id === targetSessionId)?.speakers ?? [] : [];
  const visibleSessions = myAgendaOnly ? sessions.filter((s) => s.bookmarked) : sessions;
  const openPolls = polls.filter((p) => p.status === "open" || p.myOptionId);

  const SECTIONS: { id: Section; label: string; icon: typeof Calendar }[] = [
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "speakers", label: "Speakers", icon: Mic2 },
    { id: "qa", label: "Q&A", icon: Send },
    { id: "polls", label: "Polls", icon: BarChart3 },
    { id: "announcements", label: "Updates", icon: Megaphone },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="pt-10 pb-16 px-4" style={{ background: "#1B512D" }}>
        <div className="max-w-2xl mx-auto text-white">
          <p className="text-xs uppercase tracking-wider text-white/60 mb-2">Event Hub</p>
          <h1 className="font-display text-2xl mb-2">{event.name}</h1>
          <span className="flex items-center gap-1.5 text-sm text-white/80">
            <Calendar size={14} />
            {formatDate(event.date)}
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium border-b-2 transition-colors shrink-0 min-w-[64px] ${
                  section === s.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <s.icon size={16} />
                {s.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {section === "schedule" && (
              <div>
                {sessions.some((s) => s.bookmarked) || myAgendaOnly ? (
                  <button
                    onClick={() => setMyAgendaOnly((v) => !v)}
                    className={`mb-4 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                      myAgendaOnly ? "bg-brand-600 text-white border-brand-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <BookmarkCheck size={13} />
                    My agenda
                  </button>
                ) : null}

                {sessions.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">The schedule isn&apos;t published yet — check back soon.</p>
                ) : visibleSessions.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">No sessions bookmarked yet — tap the bookmark icon on a session to add it here.</p>
                ) : (
                  <div className="space-y-3">
                    {visibleSessions.map((s) => (
                      <div key={s.id} className="border border-slate-100 rounded-xl p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">{s.sessionType}</span>
                            {s.track && <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{s.track}</span>}
                          </div>
                          <button onClick={() => handleBookmark(s.id)} disabled={busyId === s.id} className="text-slate-400 hover:text-brand-600 disabled:opacity-50 shrink-0">
                            {s.bookmarked ? <BookmarkCheck size={16} className="text-brand-600" /> : <Bookmark size={16} />}
                          </button>
                        </div>
                        <p className="font-semibold text-slate-900 text-sm">{s.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatTime(new Date(s.startTime).toTimeString().slice(0, 5))}
                          {s.endTime && ` – ${formatTime(new Date(s.endTime).toTimeString().slice(0, 5))}`}
                        </p>
                        {s.description && <p className="text-sm text-slate-600 mt-2">{s.description}</p>}
                        {s.speakers.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {s.speakers.map((sp) => (
                              <span key={sp.assignmentId} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                {sp.name} · {sp.role}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === "speakers" &&
              (speakers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">Speakers haven&apos;t been announced yet.</p>
              ) : (
                <div className="space-y-3">
                  {speakers.map((sp) => (
                    <div key={sp.id} className="flex items-start gap-3 border border-slate-100 rounded-xl p-3.5">
                      <div className="w-11 h-11 rounded-full bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center text-slate-400 font-semibold">
                        {sp.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sp.photoUrl} alt={sp.name} className="w-full h-full object-cover" />
                        ) : (
                          sp.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{sp.name}</p>
                        {(sp.title || sp.company) && (
                          <p className="text-xs text-slate-500">
                            {sp.title}
                            {sp.title && sp.company ? ", " : ""}
                            {sp.company}
                          </p>
                        )}
                        {sp.bio && <p className="text-xs text-slate-600 mt-1.5">{sp.bio}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

            {section === "qa" && (
              <div>
                {qaAvailable ? (
                  <form onSubmit={handleSubmitQuestion} className="mb-5 pb-5 border-b border-slate-100">
                    <div className="flex gap-2 mb-2">
                      <select
                        value={targetSessionId}
                        onChange={(e) => {
                          setTargetSessionId(e.target.value);
                          setTargetSpeakerId("");
                        }}
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                      >
                        <option value="">Any session</option>
                        {openSessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      {sessionSpeakerOptions.length > 0 && (
                        <select value={targetSpeakerId} onChange={(e) => setTargetSpeakerId(e.target.value)} className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                          <option value="">Any speaker</option>
                          {sessionSpeakerOptions.map((sp) => (
                            <option key={sp.speakerId} value={sp.speakerId}>
                              {sp.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      maxLength={500}
                      placeholder="Ask a question…"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                    {submitError && <p className="text-xs text-rose-600 mt-1.5">{submitError}</p>}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-2 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
                    >
                      <Send size={12} />
                      {submitting ? "Sending…" : "Send question"}
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-slate-400 mb-5 pb-5 border-b border-slate-100">Q&amp;A isn&apos;t open right now — check back once a session starts.</p>
                )}

                {questions.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No questions yet — be the first to ask.</p>
                ) : (
                  <div className="space-y-3">
                    {questions.map((q) => (
                      <div key={q.id} className="border border-slate-100 rounded-xl p-3 flex items-start gap-3">
                        <button
                          onClick={() => handleUpvote(q.id)}
                          disabled={busyId === q.id}
                          className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border shrink-0 transition-colors disabled:opacity-50 ${
                            q.hasUpvoted ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          <ThumbsUp size={13} />
                          <span className="text-[11px] font-semibold tabular-nums">{q.upvoteCount}</span>
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-medium text-slate-900">{q.askedByName}</span>
                            {q.status === "answered" && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">Answered</span>}
                            {q.speakerId && speakerById.get(q.speakerId) && (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">for {speakerById.get(q.speakerId)!.name}</span>
                            )}
                          </div>
                          <p className="text-sm text-slate-700">{q.questionText}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === "polls" &&
              (openPolls.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">No polls right now — check back during the event.</p>
              ) : (
                <div className="space-y-4">
                  {openPolls.map((p) => {
                    const total = p.options.reduce((sum, o) => sum + o.voteCount, 0);
                    const showResults = !!p.myOptionId || p.status === "closed";
                    return (
                      <div key={p.id} className="border border-slate-100 rounded-xl p-3.5">
                        <p className="font-medium text-slate-900 text-sm mb-3">{p.question}</p>
                        <div className="space-y-2">
                          {p.options.map((o) => {
                            const pct = total > 0 ? Math.round((o.voteCount / total) * 100) : 0;
                            const isMine = p.myOptionId === o.id;
                            return showResults ? (
                              <div key={o.id}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className={isMine ? "font-semibold text-brand-700" : "text-slate-600"}>
                                    {o.label}
                                    {isMine ? " ✓" : ""}
                                  </span>
                                  <span className="text-slate-500 tabular-nums">{pct}%</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-500 ${isMine ? "bg-brand-600" : "bg-slate-300"}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            ) : (
                              <button
                                key={o.id}
                                onClick={() => handlePollVote(p.id, o.id)}
                                disabled={busyId === p.id || p.status !== "open"}
                                className="w-full text-left text-sm px-3 py-2 rounded-lg border border-slate-200 hover:border-brand-600 hover:bg-brand-50/40 disabled:opacity-50 transition-colors"
                              >
                                {o.label}
                              </button>
                            );
                          })}
                        </div>
                        {p.status === "closed" && <p className="text-[11px] text-slate-400 mt-2">This poll is closed.</p>}
                      </div>
                    );
                  })}
                </div>
              ))}

            {section === "announcements" &&
              (announcements.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">No updates yet — check back during the event.</p>
              ) : (
                <div className="space-y-3">
                  {announcements.map((a) => (
                    <div key={a.id} className={`border rounded-xl p-3.5 ${a.pinned ? "border-brand-200 bg-brand-50/40" : "border-slate-100"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-slate-700 whitespace-pre-line">{a.body}</p>
                        {a.pinned && <Pin size={12} className="text-brand-600 shrink-0 mt-0.5" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2">
                        {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
