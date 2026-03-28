"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookMarked,
  BookOpen,
  GraduationCap,
  Headphones,
  Mic2,
  Quote,
  ScrollText,
  Sparkles,
  Upload,
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
import { useAuth } from "@/context/auth-context";
import { DASHBOARD_QUOTES } from "@/lib/dashboard-quotes";
import { cn } from "@/lib/utils";
import {
  apiListBookmarkMaterials,
  apiListCheatSheets,
  apiListPodcasts,
  apiListRoleReversalSessions,
  apiListTutorSessions,
  apiListUploads,
  getToken,
} from "@/lib/api";

function formatDurationMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${s}s`;
}

function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mt-3 space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {value} of {max} slots
      </p>
    </div>
  );
}

function MiniBars({
  items,
}: {
  items: { label: string; value: number; colorClass?: string }[];
}) {
  const maxV = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="mt-3 space-y-2">
      {items.map((row) => (
        <div key={row.label} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-muted-foreground">{row.label}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", row.colorClass ?? "bg-primary/80")}
              style={{ width: `${Math.min(100, Math.round((row.value / maxV) * 100))}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-medium tabular-nums text-foreground">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

type DashboardStats = {
  uploads: { used: number; max: number };
  podcasts: { count: number; max: number; totalDurationMs: number };
  tutor: { sessions: number; max: number; totalSlides: number };
  roleReversal: { sessions: number; max: number; avgScore: number | null };
  cheatSheets: { count: number; max: number };
  bookmarks: { totalLines: number; materials: number; max: number };
};

const emptyStats: DashboardStats = {
  uploads: { used: 0, max: 7 },
  podcasts: { count: 0, max: 20, totalDurationMs: 0 },
  tutor: { sessions: 0, max: 25, totalSlides: 0 },
  roleReversal: { sessions: 0, max: 25, avgScore: null },
  cheatSheets: { count: 0, max: 30 },
  bookmarks: { totalLines: 0, materials: 0, max: 400 },
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [quote] = React.useState(
    () => DASHBOARD_QUOTES[Math.floor(Math.random() * DASHBOARD_QUOTES.length)]!,
  );
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const t = getToken();
    if (!t) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const settled = await Promise.allSettled([
        apiListUploads(t),
        apiListPodcasts(t),
        apiListTutorSessions(t),
        apiListRoleReversalSessions(t),
        apiListCheatSheets(t),
        apiListBookmarkMaterials(t),
      ]);

      if (cancelled) return;

      const next = { ...emptyStats };

      if (settled[0].status === "fulfilled") {
        next.uploads = {
          used: settled[0].value.uploads.length,
          max: settled[0].value.maxUploads,
        };
      }
      if (settled[1].status === "fulfilled") {
        const p = settled[1].value;
        next.podcasts = {
          count: p.podcasts.length,
          max: p.maxPodcasts,
          totalDurationMs: p.podcasts.reduce((a, x) => a + (x.durationMs || 0), 0),
        };
      }
      if (settled[2].status === "fulfilled") {
        const tu = settled[2].value;
        next.tutor = {
          sessions: tu.sessions.length,
          max: tu.maxSessions,
          totalSlides: tu.sessions.reduce((a, s) => a + s.slides.length, 0),
        };
      }
      if (settled[3].status === "fulfilled") {
        const rr = settled[3].value;
        const sessions = rr.sessions;
        const avg =
          sessions.length > 0
            ? Math.round(
                sessions.reduce((a, s) => a + (s.evaluation?.totalScore ?? 0), 0) / sessions.length,
              )
            : null;
        next.roleReversal = {
          sessions: sessions.length,
          max: rr.maxSessions,
          avgScore: avg,
        };
      }
      if (settled[4].status === "fulfilled") {
        const cs = settled[4].value;
        next.cheatSheets = {
          count: cs.sheets.length,
          max: cs.maxSheets,
        };
      }
      if (settled[5].status === "fulfilled") {
        const bm = settled[5].value;
        const totalLines = bm.materials.reduce((a, m) => a + m.bookmarkCount, 0);
        next.bookmarks = {
          totalLines,
          materials: bm.materials.length,
          max: bm.maxBookmarks,
        };
      }

      setStats(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const s = stats ?? emptyStats;
  const bookmarkPct =
    s.bookmarks.max > 0 ? Math.min(100, Math.round((s.bookmarks.totalLines / s.bookmarks.max) * 100)) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <section
          className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-background to-muted/40 px-6 py-8 shadow-sm sm:px-10 sm:py-10"
          aria-labelledby="dash-quote"
        >
          <Quote
            className="absolute right-4 top-4 size-14 text-primary/10 sm:right-8 sm:top-8 sm:size-20"
            aria-hidden
          />
          <div className="relative max-w-3xl">
            <p
              id="dash-quote"
              className="text-lg font-medium leading-relaxed tracking-tight text-foreground sm:text-xl md:text-2xl"
            >
              “{quote.text}”
            </p>
            <p className="mt-4 text-sm font-medium text-primary">— {quote.author}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0" aria-hidden />
              A fresh quote each time you open the dashboard.
            </p>
          </div>
        </section>

        <div className="mt-10 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {authLoading ? "Hello" : `Hello, ${user?.firstName ?? "learner"}`}
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Here’s a snapshot of your study tools — uploads, AI sessions, and saved highlights.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Card className="flex flex-col rounded-xl border-border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Upload className="size-5 text-primary" aria-hidden />
                Uploads
              </CardTitle>
              <CardDescription>Materials powering every mode</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                {loading ? "—" : s.uploads.used}
                <span className="text-lg font-normal text-muted-foreground">
                  {" "}
                  / {s.uploads.max}
                </span>
              </p>
              {!loading ? <UsageBar value={s.uploads.used} max={s.uploads.max} /> : null}
              <Button variant="outline" size="sm" className="mt-4 w-full gap-1 shadow-xs" asChild>
                <Link href="/upload">
                  Manage <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col rounded-xl border-border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Headphones className="size-5 text-primary" aria-hidden />
                Podcasts
              </CardTitle>
              <CardDescription>Generated episodes & listen time</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {loading ? "—" : s.podcasts.count}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Total audio ≈{" "}
                <span className="font-medium text-foreground">
                  {loading ? "—" : formatDurationMs(s.podcasts.totalDurationMs)}
                </span>
              </p>
              {!loading ? <UsageBar value={s.podcasts.count} max={s.podcasts.max} /> : null}
              <Button variant="outline" size="sm" className="mt-4 w-full gap-1 shadow-xs" asChild>
                <Link href="/podcast">
                  Open podcast <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col rounded-xl border-border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <GraduationCap className="size-5 text-primary" aria-hidden />
                AI tutor
              </CardTitle>
              <CardDescription>Sessions & slide decks</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {loading ? "—" : s.tutor.sessions}
                <span className="text-lg font-normal text-muted-foreground"> sessions</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {loading ? "—" : s.tutor.totalSlides}
                </span>{" "}
                slides across lessons
              </p>
              {!loading ? <UsageBar value={s.tutor.sessions} max={s.tutor.max} /> : null}
              <Button variant="outline" size="sm" className="mt-4 w-full gap-1 shadow-xs" asChild>
                <Link href="/tutor">
                  Open tutor <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col rounded-xl border-border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Mic2 className="size-5 text-primary" aria-hidden />
                Role reversal
              </CardTitle>
              <CardDescription>Teaching practice & scores</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {loading ? "—" : s.roleReversal.sessions}
                <span className="text-lg font-normal text-muted-foreground"> tries</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Avg score:{" "}
                <span className="font-medium text-foreground">
                  {loading
                    ? "—"
                    : s.roleReversal.avgScore != null
                      ? `${s.roleReversal.avgScore} / 100`
                      : "—"}
                </span>
              </p>
              {!loading ? <UsageBar value={s.roleReversal.sessions} max={s.roleReversal.max} /> : null}
              {!loading &&
              s.roleReversal.sessions > 0 &&
              s.roleReversal.avgScore != null ? (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Average score trend</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-600/90 dark:bg-emerald-500/90"
                      style={{ width: `${s.roleReversal.avgScore}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <Button variant="outline" size="sm" className="mt-4 w-full gap-1 shadow-xs" asChild>
                <Link href="/role-reversal">
                  Practice <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col rounded-xl border-border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <ScrollText className="size-5 text-primary" aria-hidden />
                Cheat sheets
              </CardTitle>
              <CardDescription>Gemini study one-pagers</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {loading ? "—" : s.cheatSheets.count}
              </p>
              {!loading ? <UsageBar value={s.cheatSheets.count} max={s.cheatSheets.max} /> : null}
              <Button variant="outline" size="sm" className="mt-4 w-full gap-1 shadow-xs" asChild>
                <Link href="/cheat-sheets">
                  Open sheets <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col rounded-xl border-border shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <BookMarked className="size-5 text-primary" aria-hidden />
                Bookmarks
              </CardTitle>
              <CardDescription>Saved lines from tutor</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {loading ? "—" : s.bookmarks.totalLines}
                <span className="text-lg font-normal text-muted-foreground"> lines</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Across{" "}
                <span className="font-medium text-foreground">
                  {loading ? "—" : s.bookmarks.materials}
                </span>{" "}
                materials
              </p>
              {!loading ? (
                <div className="mt-3 space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/90"
                      style={{ width: `${bookmarkPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.bookmarks.totalLines} of {s.bookmarks.max} bookmark cap
                  </p>
                </div>
              ) : null}
              <Button variant="outline" size="sm" className="mt-4 w-full gap-1 shadow-xs" asChild>
                <Link href="/bookmarks">
                  View bookmarks <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {!loading && stats ? (
          <Card className="mt-8 rounded-xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="size-5 text-primary" aria-hidden />
                Activity mix
              </CardTitle>
              <CardDescription>Relative volume of each tool (by count)</CardDescription>
            </CardHeader>
            <CardContent>
              <MiniBars
                items={[
                  { label: "Uploads", value: s.uploads.used },
                  { label: "Podcasts", value: s.podcasts.count },
                  { label: "Tutor sessions", value: s.tutor.sessions },
                  { label: "Role reversal", value: s.roleReversal.sessions },
                  { label: "Cheat sheets", value: s.cheatSheets.count },
                  { label: "Bookmark lines", value: s.bookmarks.totalLines },
                ]}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card className="mt-8 rounded-xl border-dashed border-border bg-muted/20 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="size-5 text-primary" aria-hidden />
              More
            </CardTitle>
            <CardDescription>Friends, settings, and the rest of the app</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild>
              <Link href="/friends">Friends</Link>
            </Button>
            <Button variant="outline" className="shadow-xs" asChild>
              <Link href="/settings">Settings</Link>
            </Button>
            <Button variant="outline" className="shadow-xs" asChild>
              <Link href="/">Home</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
