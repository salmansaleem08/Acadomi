"use client";

import * as React from "react";
import Link from "next/link";
import { Headphones, Loader2, Mic2, Trash2 } from "lucide-react";

import { MarketingHeader } from "@/components/marketing-header";
import { PodcastAudioPlayer } from "@/components/podcast-audio-player";
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
import { cn } from "@/lib/utils";
import {
  apiDeletePodcast,
  apiFetchPodcastAudioBlobUrl,
  apiGeneratePodcast,
  apiListPodcasts,
  apiListUploads,
  getToken,
  type PodcastDTO,
  type UploadDTO,
} from "@/lib/api";

function formatDurationMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${s}s`;
}

export default function PodcastPage() {
  const [uploads, setUploads] = React.useState<UploadDTO[]>([]);
  const [podcasts, setPodcasts] = React.useState<PodcastDTO[]>([]);
  const [maxPodcasts, setMaxPodcasts] = React.useState(20);
  const [selectedUploadId, setSelectedUploadId] = React.useState<string>("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [audioUrls, setAudioUrls] = React.useState<Record<string, string>>({});
  const [loadingLists, setLoadingLists] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const audioUrlsRef = React.useRef(audioUrls);
  audioUrlsRef.current = audioUrls;

  React.useEffect(() => {
    return () => {
      Object.values(audioUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const refresh = React.useCallback(async () => {
    const t = getToken();
    if (!t) return;
    const [up, pod] = await Promise.all([apiListUploads(t), apiListPodcasts(t)]);
    setUploads(up.uploads);
    setPodcasts(pod.podcasts);
    setMaxPodcasts(pod.maxPodcasts);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch {
        setUploads([]);
        setPodcasts([]);
      } finally {
        setLoadingLists(false);
      }
    })();
  }, [refresh]);

  const completed = uploads.filter((u) => u.status === "completed");

  React.useEffect(() => {
    if (!selectedUploadId && completed.length > 0) {
      setSelectedUploadId(completed[0].id);
    }
  }, [completed, selectedUploadId]);

  async function ensureAudioLoaded(id: string) {
    if (audioUrls[id]) return;
    const t = getToken();
    if (!t) return;
    setError(null);
    try {
      const url = await apiFetchPodcastAudioBlobUrl(t, id);
      setAudioUrls((prev) => ({ ...prev, [id]: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audio.");
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((cur) => {
      const next = cur === id ? null : id;
      if (next) void ensureAudioLoaded(next);
      return next;
    });
  }

  async function onGenerate() {
    setError(null);
    const t = getToken();
    if (!t) return;
    if (!selectedUploadId) {
      setError("Choose a completed upload first.");
      return;
    }
    setGenerating(true);
    try {
      const { podcast } = await apiGeneratePodcast(t, selectedUploadId);
      setPodcasts((prev) => [podcast, ...prev]);
      setExpandedId(podcast.id);
      await ensureAudioLoaded(podcast.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    const t = getToken();
    if (!t) return;
    try {
      await apiDeletePodcast(t, id);
      setAudioUrls((prev) => {
        const u = prev[id];
        if (u) URL.revokeObjectURL(u);
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      setPodcasts((prev) => prev.filter((p) => p.id !== id));
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
          <h1 className="text-3xl font-semibold tracking-tight">Podcast mode</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Turn any completed upload into a short Alice &amp; Bob dialogue. Audio is generated on
            the podcast service (Gemini script + gTTS) and saved to your account so you can replay it
            anytime.
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
              <div className="flex items-center gap-2">
                <Mic2 className="size-5 text-primary" aria-hidden />
                <CardTitle className="text-lg">Generate from your material</CardTitle>
              </div>
              <CardDescription>
                Pick one of your completed uploads (same library as{" "}
                <Link href="/upload" className="font-medium text-primary underline-offset-4 hover:underline">
                  Uploads
                </Link>
                , max 7). Generation can take a minute — keep the Python podcast service running.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingLists ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading your uploads…
                </div>
              ) : completed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed uploads yet. Process a file on the Uploads page, then return here.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="upload-pick">Learning material</Label>
                    <select
                      id="upload-pick"
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      value={selectedUploadId}
                      onChange={(e) => setSelectedUploadId(e.target.value)}
                    >
                      {completed.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.title || u.fileMeta[0]?.originalName || "Untitled"} — {u.kind}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    disabled={generating || !selectedUploadId}
                    onClick={() => void onGenerate()}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Headphones className="mr-2 size-4" />
                        Create podcast
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    You can store up to {maxPodcasts} podcasts. Delete old ones to free a slot.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Headphones className="size-5 text-primary" aria-hidden />
                <CardTitle className="text-lg">Your podcasts</CardTitle>
              </div>
              <CardDescription>
                Replay saved episodes. Open a row to load the player and read the script.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLists ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : podcasts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No podcasts yet. Generate one from the card on the left.
                </p>
              ) : (
                <ul className="space-y-2">
                  {podcasts.map((p) => {
                    const open = expandedId === p.id;
                    return (
                      <li
                        key={p.id}
                        className={cn(
                          "rounded-lg border border-border bg-card/50 transition-colors",
                          open && "ring-2 ring-ring/30",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
                          <button
                            type="button"
                            onClick={() => toggleExpand(p.id)}
                            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                          >
                            <span className="block truncate font-medium">{p.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(p.createdAt).toLocaleString()} · {formatDurationMs(p.durationMs)}
                            </span>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-destructive hover:text-destructive"
                            aria-label="Delete podcast"
                            onClick={() => void onDelete(p.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        {open ? (
                          <div className="space-y-3 border-t border-border px-3 py-3 sm:px-4">
                            {audioUrls[p.id] ? (
                              <PodcastAudioPlayer src={audioUrls[p.id]} />
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                Loading audio…
                              </div>
                            )}
                            {p.script.length > 0 ? (
                              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md bg-muted/40 p-3 text-sm">
                                {p.script.map((line, i) => (
                                  <p key={i}>
                                    <span className="font-medium text-primary">{line.speaker}:</span>{" "}
                                    {line.text}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
