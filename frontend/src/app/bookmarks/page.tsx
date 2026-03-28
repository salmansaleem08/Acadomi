"use client";

import * as React from "react";
import Link from "next/link";
import { BookMarked, ChevronDown, ChevronRight, Loader2, MessageCircle, Trash2, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MarketingHeader } from "@/components/marketing-header";
import { PodcastAudioPlayer } from "@/components/podcast-audio-player";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  apiBookmarkChat,
  apiDeleteConceptBookmark,
  apiFetchBookmarkRecapBlobUrl,
  apiListBookmarkMaterials,
  apiListBookmarksForUpload,
  getToken,
  type BookmarkMaterialSummaryDTO,
  type ConceptBookmarkDTO,
} from "@/lib/api";

type ChatTurn = { role: "user" | "assistant"; content: string };

export default function BookmarksPage() {
  const [materials, setMaterials] = React.useState<BookmarkMaterialSummaryDTO[]>([]);
  const [maxBookmarks, setMaxBookmarks] = React.useState(400);
  const [selectedUploadId, setSelectedUploadId] = React.useState<string>("");
  const [bookmarks, setBookmarks] = React.useState<ConceptBookmarkDTO[]>([]);
  const [loadingMaterials, setLoadingMaterials] = React.useState(true);
  const [loadingBookmarks, setLoadingBookmarks] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [recapUrls, setRecapUrls] = React.useState<Record<string, string>>({});
  const [recapLoadingId, setRecapLoadingId] = React.useState<string | null>(null);
  const [chatOpenId, setChatOpenId] = React.useState<string | null>(null);
  const [chatHistory, setChatHistory] = React.useState<Record<string, ChatTurn[]>>({});
  const [chatInput, setChatInput] = React.useState<Record<string, string>>({});
  const [chatSendingId, setChatSendingId] = React.useState<string | null>(null);

  const recapUrlsRef = React.useRef(recapUrls);
  recapUrlsRef.current = recapUrls;

  React.useEffect(() => {
    return () => {
      Object.values(recapUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const refreshMaterials = React.useCallback(async () => {
    const t = getToken();
    if (!t) return;
    const d = await apiListBookmarkMaterials(t);
    setMaterials(d.materials);
    setMaxBookmarks(d.maxBookmarks);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await refreshMaterials();
      } catch {
        setMaterials([]);
      } finally {
        setLoadingMaterials(false);
      }
    })();
  }, [refreshMaterials]);

  React.useEffect(() => {
    if (!selectedUploadId && materials.length > 0) {
      setSelectedUploadId(materials[0].uploadId);
    }
  }, [materials, selectedUploadId]);

  React.useEffect(() => {
    if (!selectedUploadId) {
      setBookmarks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingBookmarks(true);
      setError(null);
      try {
        const t = getToken();
        if (!t) return;
        const { bookmarks: list } = await apiListBookmarksForUpload(t, selectedUploadId);
        if (!cancelled) setBookmarks(list);
      } catch (e) {
        if (!cancelled) {
          setBookmarks([]);
          setError(e instanceof Error ? e.message : "Could not load bookmarks.");
        }
      } finally {
        if (!cancelled) setLoadingBookmarks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUploadId]);

  async function loadRecap(id: string) {
    if (recapUrls[id]) return;
    const t = getToken();
    if (!t) return;
    setRecapLoadingId(id);
    setError(null);
    try {
      const url = await apiFetchBookmarkRecapBlobUrl(t, id);
      setRecapUrls((prev) => ({ ...prev, [id]: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate recap audio.");
    } finally {
      setRecapLoadingId(null);
    }
  }

  async function onDeleteBookmark(id: string) {
    const t = getToken();
    if (!t) return;
    setError(null);
    try {
      await apiDeleteConceptBookmark(t, id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      setRecapUrls((prev) => {
        const u = prev[id];
        if (u) URL.revokeObjectURL(u);
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      setChatHistory((prev) => {
        const { [id]: __, ...rest } = prev;
        return rest;
      });
      if (chatOpenId === id) setChatOpenId(null);
      await refreshMaterials();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  async function onSendChat(bookmarkId: string) {
    const text = (chatInput[bookmarkId] ?? "").trim();
    if (!text) return;
    const t = getToken();
    if (!t) return;
    const prior = chatHistory[bookmarkId] ?? [];
    const nextHistory: ChatTurn[] = [...prior, { role: "user", content: text }];
    setChatHistory((prev) => ({ ...prev, [bookmarkId]: nextHistory }));
    setChatInput((prev) => ({ ...prev, [bookmarkId]: "" }));
    setChatSendingId(bookmarkId);
    setError(null);
    try {
      const { reply } = await apiBookmarkChat(t, bookmarkId, {
        message: text,
        history: prior,
      });
      setChatHistory((prev) => ({
        ...prev,
        [bookmarkId]: [...(prev[bookmarkId] ?? nextHistory), { role: "assistant", content: reply }],
      }));
    } catch (e) {
      setChatHistory((prev) => ({ ...prev, [bookmarkId]: prior }));
      setChatInput((prev) => ({ ...prev, [bookmarkId]: text }));
      setError(e instanceof Error ? e.message : "Chat failed.");
    } finally {
      setChatSendingId(null);
    }
  }

  const selectedMaterial = materials.find((m) => m.uploadId === selectedUploadId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Concept bookmarks &amp; AI recaps</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            During{" "}
            <Link href="/tutor" className="font-medium text-primary underline-offset-4 hover:underline">
              AI tutor
            </Link>
            , tap <strong>+</strong> to save the <strong>full</strong> narration for that slide (or the
            full Q&A answer), not just the short subtitle phrase. Open a
            material here to hear a short recap or ask follow-up questions grounded in your notes.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <Card className="h-fit border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookMarked className="size-5 text-primary" aria-hidden />
                <CardTitle className="text-lg">Materials</CardTitle>
              </div>
              <CardDescription>Uploads that have at least one saved line.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMaterials ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : materials.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bookmarks yet. Start a tutor session and tap <strong>+</strong> on a subtitle.
                </p>
              ) : (
                <ul className="space-y-1">
                  {materials.map((m) => {
                    const sel = m.uploadId === selectedUploadId;
                    return (
                      <li key={m.uploadId}>
                        <button
                          type="button"
                          onClick={() => setSelectedUploadId(m.uploadId)}
                          className={cn(
                            "flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                            sel
                              ? "border-primary/50 bg-primary/5"
                              : "border-transparent hover:bg-accent",
                          )}
                        >
                          {sel ? (
                            <ChevronDown className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
                          ) : (
                            <ChevronRight className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{m.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {m.bookmarkCount} line{m.bookmarkCount === 1 ? "" : "s"} · {m.kind}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Account limit: {maxBookmarks} bookmarks total.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                {selectedMaterial ? selectedMaterial.title : "Saved lines"}
              </CardTitle>
              <CardDescription>
                Recap uses Gemini + the same tutor TTS service as live teaching. Chat uses your
                saved passage and upload notes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedUploadId ? (
                <p className="text-sm text-muted-foreground">Select a material with bookmarks.</p>
              ) : loadingBookmarks ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading bookmarks…
                </div>
              ) : bookmarks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lines for this upload (they may have been removed).
                </p>
              ) : (
                <ul className="space-y-4">
                  {bookmarks.map((b) => {
                    const chatOpen = chatOpenId === b.id;
                    const turns = chatHistory[b.id] ?? [];
                    return (
                      <li
                        key={b.id}
                        className="rounded-xl border border-border bg-card/40 p-4 shadow-xs"
                      >
                        <blockquote className="max-h-[min(50vh,28rem)] overflow-y-auto whitespace-pre-wrap border-l-2 border-primary pl-3 text-sm font-normal leading-relaxed text-foreground">
                          {b.lineText}
                        </blockquote>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {b.subtitleSource === "qa_answer" ? "From Q&A answer" : "From narration"}
                          {b.slideTitle ? ` · ${b.slideTitle}` : ""}
                          {b.slideIndex != null ? ` · Slide ${b.slideIndex + 1}` : ""}
                          {" · "}
                          {new Date(b.createdAt).toLocaleString()}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={recapLoadingId === b.id}
                            onClick={() => void loadRecap(b.id)}
                          >
                            {recapLoadingId === b.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Volume2 className="size-4" />
                            )}
                            Recap (audio)
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => setChatOpenId((id) => (id === b.id ? null : b.id))}
                          >
                            <MessageCircle className="size-4" />
                            {chatOpen ? "Hide chat" : "Ask about this"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void onDeleteBookmark(b.id)}
                          >
                            <Trash2 className="mr-1 size-4" />
                            Remove
                          </Button>
                        </div>
                        {recapUrls[b.id] ? (
                          <div className="mt-3 w-full max-w-xl">
                            <PodcastAudioPlayer src={recapUrls[b.id]} />
                          </div>
                        ) : null}

                        {chatOpen ? (
                          <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                            {turns.length > 0 ? (
                              <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
                                {turns.map((turn, i) => (
                                  <li
                                    key={i}
                                    className={cn(
                                      "rounded-md px-2 py-1.5",
                                      turn.role === "user"
                                        ? "bg-background/80"
                                        : "bg-primary/5",
                                    )}
                                  >
                                    <span className="text-xs font-semibold text-muted-foreground">
                                      {turn.role === "user" ? "You" : "Tutor"}
                                    </span>
                                    {turn.role === "assistant" ? (
                                      <div className="cheat-sheet-md mt-1 text-foreground">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                          {turn.content}
                                        </ReactMarkdown>
                                      </div>
                                    ) : (
                                      <p className="mt-1 whitespace-pre-wrap">{turn.content}</p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Ask for a deeper explanation, example, or connection to the rest of
                                your notes.
                              </p>
                            )}
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <Textarea
                                placeholder="Your question…"
                                className="min-h-[4rem] flex-1 resize-y text-sm"
                                value={chatInput[b.id] ?? ""}
                                disabled={chatSendingId === b.id}
                                onChange={(e) =>
                                  setChatInput((prev) => ({ ...prev, [b.id]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    void onSendChat(b.id);
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                disabled={chatSendingId === b.id || !(chatInput[b.id] ?? "").trim()}
                                onClick={() => void onSendChat(b.id)}
                              >
                                {chatSendingId === b.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  "Send"
                                )}
                              </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Ctrl+Enter to send. Replies use your saved material for context.
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
        </div>
      </main>
    </div>
  );
}
