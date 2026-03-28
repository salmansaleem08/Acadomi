"use client";

import * as React from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import { FileDown, Loader2, ScrollText, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MarketingHeader } from "@/components/marketing-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  apiDeleteCheatSheet,
  apiGenerateCheatSheet,
  apiGetCheatSheet,
  apiListCheatSheets,
  apiListUploads,
  getToken,
  type CheatSheetListItemDTO,
  type UploadDTO,
} from "@/lib/api";

function CheatSheetBody({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div className={cn("cheat-sheet-md", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

function safePngBasename(topic: string): string {
  const s = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return s || "cheat-sheet";
}

export default function CheatSheetsPage() {
  const [uploads, setUploads] = React.useState<UploadDTO[]>([]);
  const [sheets, setSheets] = React.useState<CheatSheetListItemDTO[]>([]);
  const [maxSheets, setMaxSheets] = React.useState(30);
  const [selectedUploadId, setSelectedUploadId] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [markdownById, setMarkdownById] = React.useState<Record<string, string>>({});
  const [loadingLists, setLoadingLists] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [downloadingPng, setDownloadingPng] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const exportRef = React.useRef<HTMLDivElement>(null);

  const refresh = React.useCallback(async () => {
    const t = getToken();
    if (!t) return;
    const [up, cs] = await Promise.all([apiListUploads(t), apiListCheatSheets(t)]);
    setUploads(up.uploads);
    setSheets(cs.sheets);
    setMaxSheets(cs.maxSheets);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch {
        setUploads([]);
        setSheets([]);
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

  const expandedMarkdown = expandedId ? markdownById[expandedId] : undefined;
  const expandedSheet = expandedId ? sheets.find((s) => s.id === expandedId) : undefined;

  async function ensureMarkdownLoaded(id: string) {
    if (markdownById[id]) return;
    const t = getToken();
    if (!t) return;
    setLoadingDetail(true);
    setError(null);
    try {
      const { sheet } = await apiGetCheatSheet(t, id);
      setMarkdownById((prev) => ({ ...prev, [id]: sheet.markdown }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load cheat sheet.");
    } finally {
      setLoadingDetail(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((cur) => {
      const next = cur === id ? null : id;
      if (next) void ensureMarkdownLoaded(next);
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
    const focus = topic.trim();
    if (!focus) {
      setError("Enter a topic so the sheet stays focused (e.g. \"Chain rule\", \"KVL loops\").");
      return;
    }
    setGenerating(true);
    try {
      const { sheet } = await apiGenerateCheatSheet(t, selectedUploadId, focus);
      setSheets((prev) => {
        const rest = prev.filter((s) => s.id !== sheet.id);
        return [sheet, ...rest];
      });
      setMarkdownById((prev) => ({ ...prev, [sheet.id]: sheet.markdown }));
      setExpandedId(sheet.id);
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
      await apiDeleteCheatSheet(t, id);
      setSheets((prev) => prev.filter((s) => s.id !== id));
      setMarkdownById((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  async function onDownloadPng() {
    if (!expandedId || !expandedMarkdown || !expandedSheet) return;
    const node = exportRef.current;
    if (!node) {
      setError("Nothing to export yet.");
      return;
    }
    setDownloadingPng(true);
    setError(null);
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const name = safePngBasename(expandedSheet.topic);
      const a = document.createElement("a");
      a.download = `acadomi-${name}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : "PNG export failed.");
    } finally {
      setDownloadingPng(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Smart cheat sheet</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pick a completed upload and a topic. Acadomi builds a dense, scannable cheat sheet
            (tables, bold sections, concrete examples). Sheets stay in your account; download a PNG
            for printing or a quick glance.
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
                <ScrollText className="size-5 text-primary" aria-hidden />
                <CardTitle className="text-lg">Create a sheet</CardTitle>
              </div>
              <CardDescription>
                Uses the same library as{" "}
                <Link
                  href="/upload"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Uploads
                </Link>
                . One sheet = one focused topic from that material.
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
                  No completed uploads yet. Process a file on the Uploads page, then return here.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cs-upload">Learning material</Label>
                    <select
                      id="cs-upload"
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
                  <div className="space-y-2">
                    <Label htmlFor="cs-topic">Topic for this cheat sheet</Label>
                    <Input
                      id="cs-topic"
                      placeholder="e.g. Ohm's law and series resistors"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      The model will prioritize how-to steps, formulas, and workflows for this focus.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    disabled={generating || !selectedUploadId || !topic.trim()}
                    onClick={() => void onGenerate()}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <ScrollText className="mr-2 size-4" />
                        Generate cheat sheet
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    You can keep up to {maxSheets} sheets. Delete old ones to free a slot.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ScrollText className="size-5 text-primary" aria-hidden />
                <CardTitle className="text-lg">Your cheat sheets</CardTitle>
              </div>
              <CardDescription>Open a row to view Markdown and export PNG.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLists ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : sheets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sheets yet. Generate one from the card on the left.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sheets.map((s) => {
                    const open = expandedId === s.id;
                    return (
                      <li
                        key={s.id}
                        className={cn(
                          "rounded-lg border border-border bg-card/50 transition-colors",
                          open && "ring-2 ring-ring/30",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
                          <button
                            type="button"
                            onClick={() => toggleExpand(s.id)}
                            className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="block truncate font-medium">{s.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(s.updatedAt).toLocaleString()} · {s.preview}
                            </span>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-destructive hover:text-destructive"
                            aria-label="Delete cheat sheet"
                            onClick={() => void onDelete(s.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        {open ? (
                          <div className="space-y-3 border-t border-border px-3 py-3 sm:px-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                disabled={
                                  !markdownById[s.id] || loadingDetail || downloadingPng
                                }
                                onClick={() => void onDownloadPng()}
                              >
                                {downloadingPng ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <FileDown className="size-4" />
                                )}
                                Download PNG
                              </Button>
                            </div>
                            {loadingDetail && !markdownById[s.id] ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                Loading sheet…
                              </div>
                            ) : markdownById[s.id] ? (
                              <div className="max-h-[min(70vh,36rem)] overflow-y-auto rounded-md border border-border bg-card p-4">
                                <CheatSheetBody markdown={markdownById[s.id]} />
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

      {expandedId && expandedMarkdown && expandedSheet ? (
        <div
          ref={exportRef}
          className="cheat-sheet-md cheat-sheet-md-export pointer-events-none fixed left-[-12000px] top-0 z-0 w-[720px] bg-white p-8 text-black"
          aria-hidden
        >
          <p className="mb-4 text-lg font-bold leading-tight text-black">{expandedSheet.title}</p>
          <CheatSheetBody markdown={expandedMarkdown} className="text-black" />
        </div>
      ) : null}
    </div>
  );
}
