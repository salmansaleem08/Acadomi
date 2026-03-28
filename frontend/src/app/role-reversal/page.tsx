"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  GraduationCap,
  Lightbulb,
  Loader2,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  Trash2,
} from "lucide-react";

import { MarketingHeader } from "@/components/marketing-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  apiDeleteRoleReversalSession,
  apiEvaluateRoleReversal,
  apiListRoleReversalSessions,
  apiListUploads,
  getToken,
  type RoleReversalEvaluationDTO,
  type RoleReversalSessionDTO,
  type UploadDTO,
} from "@/lib/api";

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-center shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-xl font-semibold tabular-nums text-primary">{value}</div>
    </div>
  );
}

function RadarPanel({ points }: { points: { label: string; value: number }[] }) {
  if (points.length < 3) return null;
  const n = points.length;
  const cx = 90;
  const cy = 90;
  const rMax = 72;
  const ring = points
    .map((p, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      const pr = (p.value / 100) * rMax;
      return `${cx + pr * Math.cos(a)},${cy + pr * Math.sin(a)}`;
    })
    .join(" ");
  const full = points
    .map((_, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      return `${cx + rMax * Math.cos(a)},${cy + rMax * Math.sin(a)}`;
    })
    .join(" ");

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" aria-hidden>
        <polygon
          points={full}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth="1"
        />
        <polygon
          points={ring}
          fill="color-mix(in oklab, var(--primary) 22%, transparent)"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const a = (i / n) * 2 * Math.PI - Math.PI / 2;
          const pr = (p.value / 100) * rMax;
          const x = cx + pr * Math.cos(a);
          const y = cy + pr * Math.sin(a);
          return <circle key={p.label} cx={x} cy={y} r={4} fill="var(--primary)" />;
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {points.map((p) => (
          <span key={p.label}>
            <span className="font-medium text-foreground">{p.label}</span> {p.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarComparePanel({
  rows,
}: {
  rows: { label: string; you: number; ideal: number }[];
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium">{row.label}</span>
            <span className="tabular-nums text-muted-foreground">
              You {row.you} · Target {row.ideal}
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary/85"
              style={{ width: `${Math.min(100, row.you)}%` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 border-r-2 border-dashed border-secondary/70"
              style={{ left: `${Math.min(100, row.ideal)}%` }}
              title="Target"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EvaluationShowcase({ ev }: { ev: RoleReversalEvaluationDTO }) {
  const radar =
    ev.visualHints?.radar && ev.visualHints.radar.length >= 3
      ? ev.visualHints.radar
      : [
          { label: "Clarity", value: ev.scoreClarity },
          { label: "Concepts", value: ev.scoreConcepts },
          { label: "Fluency", value: ev.scoreFluency },
        ];

  const bars =
    ev.visualHints?.barCompare && ev.visualHints.barCompare.length > 0
      ? ev.visualHints.barCompare
      : [
          { label: "Clarity", you: ev.scoreClarity, ideal: 85 },
          { label: "Concepts", you: ev.scoreConcepts, ideal: 90 },
          { label: "Fluency", you: ev.scoreFluency, ideal: 80 },
        ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-gradient-to-b from-primary/8 via-card to-card p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="text-center sm:text-left">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total score
          </div>
          <div className="bg-gradient-to-br from-primary to-primary/70 bg-clip-text font-mono text-5xl font-bold tabular-nums text-transparent sm:text-6xl">
            {ev.totalScore}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">out of 100</p>
        </div>
        <div className="grid w-full max-w-xs grid-cols-3 gap-2 sm:max-w-none">
          <ScorePill label="Clarity" value={ev.scoreClarity} />
          <ScorePill label="Concepts" value={ev.scoreConcepts} />
          <ScorePill label="Fluency" value={ev.scoreFluency} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Target className="size-4 text-primary" aria-hidden />
              Skill radar
            </div>
            <CardDescription>How your explanation lands across dimensions</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pt-2">
            <RadarPanel points={radar} />
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GraduationCap className="size-4 text-primary" aria-hidden />
              You vs target
            </div>
            <CardDescription>Dashed line marks a strong target band</CardDescription>
          </CardHeader>
          <CardContent>
            <BarComparePanel rows={bars} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-amber-500" aria-hidden />
              <CardTitle className="text-base">Feedback</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            {ev.feedback}
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Brain className="size-4 text-sky-500" aria-hidden />
              <CardTitle className="text-base">Topic understanding</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            {ev.topicUnderstanding}
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-card shadow-sm md:col-span-2">
          <CardHeader className="pb-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="size-4" aria-hidden />
                  Strengths
                </div>
                <p className="text-sm text-muted-foreground">{ev.strength}</p>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-4" aria-hidden />
                  Gaps to work on
                </div>
                <p className="text-sm text-muted-foreground">{ev.weakness}</p>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

export default function RoleReversalPage() {
  const [topic, setTopic] = React.useState("");
  const [uploads, setUploads] = React.useState<UploadDTO[]>([]);
  const [uploadId, setUploadId] = React.useState("");
  const [sessions, setSessions] = React.useState<RoleReversalSessionDTO[]>([]);
  const [maxSessions, setMaxSessions] = React.useState(30);
  const [loadingLists, setLoadingLists] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [recording, setRecording] = React.useState(false);
  const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
  const recordingRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const [latest, setLatest] = React.useState<RoleReversalSessionDTO | null>(null);
  const [improveSessionId, setImproveSessionId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const t = getToken();
    if (!t) return;
    const [up, rr] = await Promise.all([apiListUploads(t), apiListRoleReversalSessions(t)]);
    setUploads(up.uploads);
    setSessions(rr.sessions);
    setMaxSessions(rr.maxSessions);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch {
        setUploads([]);
        setSessions([]);
      } finally {
        setLoadingLists(false);
      }
    })();
  }, [refresh]);

  const completed = uploads.filter((u) => u.status === "completed");

  React.useEffect(() => {
    if (!uploadId && completed.length > 0) {
      setUploadId(completed[0].id);
    }
  }, [completed, uploadId]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setAudioBlob(blob);
      };
      recordingRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied or unavailable.");
    }
  }

  function stopRecording() {
    recordingRef.current?.stop();
    recordingRef.current = null;
    setRecording(false);
  }

  async function onSubmit() {
    setError(null);
    const t = getToken();
    if (!t) return;
    if (!topic.trim()) {
      setError("Enter the topic you are teaching.");
      return;
    }
    if (!uploadId) {
      setError("Select reference material.");
      return;
    }
    if (!audioBlob?.size) {
      setError("Record your explanation first.");
      return;
    }
    setSubmitting(true);
    try {
      const { session } = await apiEvaluateRoleReversal(t, {
        topic: topic.trim(),
        uploadId,
        audio: audioBlob,
        sessionId: improveSessionId ?? undefined,
      });
      setLatest(session);
      setImproveSessionId(session.id);
      setAudioBlob(null);
      await refresh();
      setExpandedId(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function onImprove() {
    if (!latest) return;
    setImproveSessionId(latest.id);
    setTopic(latest.topic);
    setUploadId(latest.sourceUploadId);
    setAudioBlob(null);
    setError(null);
  }

  async function onDeleteSession(id: string) {
    setError(null);
    const t = getToken();
    if (!t) return;
    try {
      await apiDeleteRoleReversalSession(t, id);
      if (latest?.id === id) {
        setLatest(null);
        setImproveSessionId(null);
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Role reversal teaching</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pick a topic and your study material, then <strong>teach it out loud</strong>. We
            transcribe your voice, compare it to your upload, and Gemini scores clarity, concepts,
            and fluency—with charts and structured feedback. Use <strong>Improve</strong> to record
            again; scores update on the same session.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Teach the topic</CardTitle>
              <CardDescription>
                Reference material comes from your{" "}
                <Link href="/upload" className="font-medium text-primary underline-offset-4 hover:underline">
                  completed uploads
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingLists ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : completed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed uploads yet. Add content on the Uploads page first.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="topic">Topic you are teaching</Label>
                    <Textarea
                      id="topic"
                      placeholder="e.g. The light-dependent reactions of photosynthesis"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      rows={3}
                      className="resize-y min-h-[72px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mat">Reference material</Label>
                    <select
                      id="mat"
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      value={uploadId}
                      onChange={(e) => setUploadId(e.target.value)}
                    >
                      {completed.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.title || u.fileMeta[0]?.originalName || "Untitled"} — {u.kind}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {!recording ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void startRecording()}
                          disabled={!!audioBlob}
                        >
                          <Mic className="mr-2 size-4" />
                          {audioBlob ? "Recording saved" : "Start recording"}
                        </Button>
                      ) : (
                        <Button type="button" variant="destructive" onClick={stopRecording}>
                          <Square className="mr-2 size-4" />
                          Stop
                        </Button>
                      )}
                      {audioBlob && !recording ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAudioBlob(null)}>
                          <RotateCcw className="mr-1 size-4" />
                          Discard clip
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Speak clearly for ~30–90 seconds. One clip per submission.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void onSubmit()}
                      disabled={submitting || !audioBlob || recording}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Evaluating…
                        </>
                      ) : improveSessionId ? (
                        "Submit improved take"
                      ) : (
                        "Get feedback"
                      )}
                    </Button>
                    {latest ? (
                      <>
                        <Button type="button" variant="outline" onClick={onImprove}>
                          <RotateCcw className="mr-2 size-4" />
                          Improve (record again)
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setLatest(null);
                            setImproveSessionId(null);
                            setAudioBlob(null);
                            setTopic("");
                          }}
                        >
                          New session
                        </Button>
                      </>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Max {maxSessions} saved sessions. Uses the same Gemini API as the rest of Acadomi.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Latest result</CardTitle>
              <CardDescription>
                After you submit, your scores and charts appear here. Open past sessions in the list
                below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {latest ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Attempt #{latest.attemptCount} · Updated {new Date(latest.updatedAt).toLocaleString()}
                  </p>
                  <EvaluationShowcase ev={latest.evaluation} />
                  <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Transcript: </span>
                    {latest.transcript}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No evaluation yet. Record your teaching and submit from the left.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Your sessions</CardTitle>
            <CardDescription>Click to expand scores and feedback. Delete to free a slot.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLists ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions saved yet.</p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => {
                  const open = expandedId === s.id;
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "rounded-lg border border-border bg-card/50",
                        open && "ring-2 ring-ring/30",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                          onClick={() => setExpandedId(open ? null : s.id)}
                        >
                          <span className="block font-medium">{s.topic}</span>
                          <span className="text-xs text-muted-foreground">
                            Score {s.evaluation.totalScore} · {s.attemptCount} attempt
                            {s.attemptCount !== 1 ? "s" : ""} ·{" "}
                            {new Date(s.updatedAt).toLocaleString()}
                          </span>
                        </button>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setLatest(s);
                              setImproveSessionId(s.id);
                              setTopic(s.topic);
                              setUploadId(s.sourceUploadId);
                              setAudioBlob(null);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Improve
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            aria-label="Delete"
                            onClick={() => void onDeleteSession(s.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                      {open ? (
                        <div className="border-t border-border px-3 py-4 sm:px-4">
                          <EvaluationShowcase ev={s.evaluation} />
                          <p className="mt-4 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Transcript: </span>
                            {s.transcript}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
