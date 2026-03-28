"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileAudio,
  FileImage,
  FileText,
  Loader2,
  Mic,
  Square,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  apiCreateUpload,
  apiDeleteUpload,
  apiListUploads,
  getToken,
  type UploadDTO,
} from "@/lib/api";

type UploadKind = "pdf" | "image" | "audio";

export default function UploadPage() {
  const [kind, setKind] = React.useState<UploadKind>("pdf");
  const [materialTitle, setMaterialTitle] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [list, setList] = React.useState<UploadDTO[]>([]);
  const [maxUploads, setMaxUploads] = React.useState(7);
  const [loading, setLoading] = React.useState(false);
  const [loadingList, setLoadingList] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const recordingRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const [recording, setRecording] = React.useState(false);

  const refreshList = React.useCallback(async () => {
    const t = getToken();
    if (!t) return;
    const data = await apiListUploads(t);
    setList(data.uploads);
    setMaxUploads(data.maxUploads);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await refreshList();
      } catch {
        setList([]);
      } finally {
        setLoadingList(false);
      }
    })();
  }, [refreshList]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    setFiles(picked);
    setError(null);
  }

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
        const file = new File([blob], `recording-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });
        setFiles([file]);
        setKind("audio");
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const t = getToken();
    if (!t) return;
    if (files.length === 0) {
      setError("Add at least one file or record audio.");
      return;
    }
    setLoading(true);
    try {
      await apiCreateUpload(t, kind, prompt, files, materialTitle);
      setFiles([]);
      setMaterialTitle("");
      setPrompt("");
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    const t = getToken();
    if (!t) return;
    setLoading(true);
    try {
      await apiDeleteUpload(t, id);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setLoading(false);
    }
  }

  const atLimit = list.length >= maxUploads;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Learning uploads</h1>
          <p className="text-muted-foreground">
            Upload PDFs, images, or audio. Add an optional title and instructions so we can turn
            your files into structured notes in your account (max {maxUploads} items). Podcast, tutor,
            and other modes use this library.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" className="mt-6">
            <div>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </div>
          </Alert>
        ) : null}

        <Card className="mt-8 rounded-xl border border-border shadow-sm">
          <CardHeader>
            <CardTitle>New upload</CardTitle>
            <CardDescription>
              PDF: one file · Images: up to four · Audio: one file or browser recording (WebM).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-5">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["pdf", FileText, "PDF"],
                    ["image", FileImage, "Images"],
                    ["audio", FileAudio, "Audio"],
                  ] as const
                ).map(([k, Icon, label]) => (
                  <Button
                    key={k}
                    type="button"
                    variant={kind === k ? "default" : "outline"}
                    className={cn("gap-2 shadow-xs", kind === k ? "" : "border-border")}
                    onClick={() => {
                      setKind(k);
                      setFiles([]);
                      setError(null);
                    }}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="material-title">Title (optional)</Label>
                <Input
                  id="material-title"
                  value={materialTitle}
                  onChange={(e) => setMaterialTitle(e.target.value)}
                  placeholder="e.g. Week 3 — Operating systems processes"
                  maxLength={200}
                  className="h-11 text-base md:text-sm"
                  disabled={atLimit || loading}
                />
                <p className="text-xs text-muted-foreground">
                  If you leave this blank, we use the file name (or &quot;Learning upload&quot;).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="files">Files</Label>
                <Input
                  id="files"
                  type="file"
                  accept={
                    kind === "pdf"
                      ? "application/pdf"
                      : kind === "image"
                        ? "image/*"
                        : "audio/*,video/webm"
                  }
                  multiple={kind === "image"}
                  onChange={onFileChange}
                  className="h-11 cursor-pointer"
                  disabled={atLimit || loading}
                />
                {kind === "audio" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {!recording ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="gap-2"
                        onClick={startRecording}
                        disabled={atLimit || loading}
                      >
                        <Mic className="size-4" />
                        Record in browser
                      </Button>
                    ) : (
                      <Button type="button" variant="destructive" className="gap-2" onClick={stopRecording}>
                        <Square className="size-4" />
                        Stop
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Browser recording is saved in a standard web audio format.
                    </span>
                  </div>
                ) : null}
                {files.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Selected: {files.map((f) => f.name).join(", ")}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="prompt">Instructions for processing (optional)</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Focus on definitions for my OS exam; list pros and cons…"
                  className="min-h-[120px] text-base md:text-sm"
                  disabled={atLimit || loading}
                />
              </div>

              <Button type="submit" className="h-11 w-full font-medium sm:w-auto" disabled={atLimit || loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Processing…
                  </>
                ) : atLimit ? (
                  "Upload limit reached"
                ) : (
                  "Upload & process"
                )}
              </Button>
              {atLimit ? (
                <p className="text-sm text-muted-foreground">
                  Delete an item below to free a slot.
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <section className="mt-12 space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Your materials</h2>
          {loadingList ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : list.length === 0 ? (
            <Card className="rounded-xl border border-dashed border-border bg-muted/20 shadow-sm">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No uploads yet. Processed notes will appear here for podcast / tutor features later.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-4">
              {list.map((u) => (
                <li key={u.id}>
                  <Card className="rounded-xl border border-border shadow-sm">
                    <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                      <div>
                        <CardTitle className="text-lg">{u.title}</CardTitle>
                        <CardDescription>
                          {u.kind.toUpperCase()} · {new Date(u.createdAt).toLocaleString()} ·{" "}
                          <span
                            className={cn(
                              u.status === "completed" && "text-primary",
                              u.status === "failed" && "text-destructive",
                            )}
                          >
                            {u.status}
                          </span>
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0 shadow-xs"
                        aria-label="Delete upload"
                        onClick={() => onDelete(u.id)}
                        disabled={loading}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {u.userPrompt ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Your prompt: </span>
                          {u.userPrompt}
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto px-0 text-primary hover:underline"
                        onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                      >
                        {expanded === u.id ? "Hide details" : "View processed notes"}
                      </Button>
                      {expanded === u.id ? (
                        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 text-sm">
                          <div>
                            <p className="font-medium text-foreground">Processed notes</p>
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
                              {u.processedContent || "—"}
                            </pre>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">Extracted text (raw)</p>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                              {u.extractedText || "—"}
                            </pre>
                          </div>
                          {u.errorMessage ? (
                            <p className="text-destructive text-xs">{u.errorMessage}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          <Link href="/dashboard" className="text-primary hover:underline">
            Back to dashboard
          </Link>
        </p>
      </main>
    </div>
  );
}
