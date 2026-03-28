"use client";

import * as React from "react";
import Link from "next/link";
import {
  Baby,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Loader2,
  Mic,
  Plus,
  Play,
  ScanEye,
  Square,
  Trash2,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  apiCreateConceptBookmark,
  apiCreateTutorSession,
  apiDeleteTutorSession,
  apiFetchTutorSlideAudioBlobUrl,
  apiFetchTutorTtsBlobUrl,
  apiListTutorSessions,
  apiListUploads,
  apiTutorAsk,
  apiTutorFocusAnalyze,
  apiTutorFocusReset,
  apiTutorSlideEli5,
  getToken,
  type TutorFocusDTO,
  type TutorSessionDTO,
  type UploadDTO,
} from "@/lib/api";

function tokenizeScript(script: string): string[] {
  return script.trim().split(/\s+/).filter(Boolean);
}

/** One subtitle line per phrase; lines swap only when the phrase index changes (avoids word-by-word jitter). */
const SUBTITLE_WORDS_PER_PHRASE = 8;
/** Nudge display slightly early so captions feel aligned with speech (no true word timestamps from TTS). */
const SUBTITLE_LEAD_RATIO = 0.035;

const ELI5_ACK_TEXT = "Sure — I'll explain this slide in simpler, easy words.";

function buildPhraseLines(words: string[], wordsPerPhrase: number): string[] {
  if (words.length === 0) return [];
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerPhrase) {
    lines.push(words.slice(i, i + wordsPerPhrase).join(" "));
  }
  return lines;
}

function focusTone(f: TutorFocusDTO | null): string {
  if (!f) return "bg-muted text-muted-foreground";
  if (!f.faceFound) return "bg-destructive/15 text-destructive";
  if (f.status === "CALIBRATING") return "bg-muted text-foreground";
  if (f.alarm) return "bg-destructive/15 text-destructive";
  if (f.status === "FOCUSED") return "bg-primary/15 text-primary";
  if (f.status === "DISTRACTED") return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
}

export default function TutorPage() {
  const [uploads, setUploads] = React.useState<UploadDTO[]>([]);
  const [sessions, setSessions] = React.useState<TutorSessionDTO[]>([]);
  const [maxSessions, setMaxSessions] = React.useState(25);
  const [selectedUploadId, setSelectedUploadId] = React.useState("");
  const [topicFocus, setTopicFocus] = React.useState("");
  const [activeSession, setActiveSession] = React.useState<TutorSessionDTO | null>(null);
  const [slideIndex, setSlideIndex] = React.useState(0);
  const [loadingLists, setLoadingLists] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bookmarkSaving, setBookmarkSaving] = React.useState<"narration" | "qa_answer" | null>(null);
  const [bookmarkNotice, setBookmarkNotice] = React.useState<string | null>(null);
  const bookmarkErrorTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [camOn, setCamOn] = React.useState(false);
  const [focus, setFocus] = React.useState<TutorFocusDTO | null>(null);
  const [narrationUrls, setNarrationUrls] = React.useState<Record<string, string>>({});
  const [narrationLoading, setNarrationLoading] = React.useState(false);
  const [playingSlide, setPlayingSlide] = React.useState<number | null>(null);

  const [asking, setAsking] = React.useState(false);
  const [lastQa, setLastQa] = React.useState<{ question: string; answer: string } | null>(null);
  const [answerAudioUrl, setAnswerAudioUrl] = React.useState<string | null>(null);
  const [autoAdvanceNarration, setAutoAdvanceNarration] = React.useState(true);
  const [alertSounds, setAlertSounds] = React.useState(true);
  const [narrationSubtitleLine, setNarrationSubtitleLine] = React.useState("");
  const [answerSubtitleLine, setAnswerSubtitleLine] = React.useState("");
  const [playingAnswer, setPlayingAnswer] = React.useState(false);
  const [answerPaused, setAnswerPaused] = React.useState(false);
  const [questionSubmitting, setQuestionSubmitting] = React.useState(false);
  /** Simpler script for the current slide only; cleared when changing slides. */
  const [eli5Script, setEli5Script] = React.useState<string | null>(null);
  const [eli5ForSlideIndex, setEli5ForSlideIndex] = React.useState<number | null>(null);
  const [eli5Busy, setEli5Busy] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const questionMicStreamRef = React.useRef<MediaStream | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordChunksRef = React.useRef<Blob[]>([]);
  const focusTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRoleRef = React.useRef<"slide" | "answer" | null>(null);
  const activeSessionRef = React.useRef<TutorSessionDTO | null>(null);
  const autoAdvanceRef = React.useRef(true);
  const focusRef = React.useRef<TutorFocusDTO | null>(null);
  const softBeepTickRef = React.useRef(0);
  activeSessionRef.current = activeSession;
  autoAdvanceRef.current = autoAdvanceNarration;
  focusRef.current = focus;

  const narrationUrlsRef = React.useRef(narrationUrls);
  narrationUrlsRef.current = narrationUrls;

  const slideIndexRef = React.useRef(slideIndex);
  slideIndexRef.current = slideIndex;
  const playingSlideRef = React.useRef(playingSlide);
  playingSlideRef.current = playingSlide;

  /** Saved playback position per session slide (blob URL key `${id}:${idx}`). */
  const narrationProgressRef = React.useRef<Record<string, number>>({});
  /** After Q&A, resume slide narration from here (if user is still on that slide). */
  const lectureResumeRef = React.useRef<{ slideIndex: number; key: string; time: number } | null>(null);
  const subtitleRafRef = React.useRef<number | null>(null);
  const subtitlePhraseLinesRef = React.useRef<string[]>([]);
  const answerBlobUrlRef = React.useRef<string | null>(null);
  const lastAnswerTtsTextRef = React.useRef("");
  const answerResumeTimeRef = React.useRef(0);

  const cancelSubtitleRaf = React.useCallback(() => {
    if (subtitleRafRef.current != null) {
      cancelAnimationFrame(subtitleRafRef.current);
      subtitleRafRef.current = null;
    }
  }, []);

  const attachSubtitleRaf = React.useCallback(
    (a: HTMLAudioElement, words: string[], setLine: (line: string) => void) => {
      cancelSubtitleRaf();
      const lines = buildPhraseLines(words, SUBTITLE_WORDS_PER_PHRASE);
      subtitlePhraseLinesRef.current = lines;
      const lastChunkIdx = { current: -1 };
      const tick = () => {
        const el = audioRef.current;
        if (!el || el !== a) {
          subtitleRafRef.current = null;
          return;
        }
        if (el.paused) {
          subtitleRafRef.current = null;
          return;
        }
        const d = el.duration;
        const t = el.currentTime;
        const phraseLines = subtitlePhraseLinesRef.current;
        if (phraseLines.length > 0 && d > 0 && Number.isFinite(d)) {
          const ratio = Math.min(1, Math.max(0, t / d + SUBTITLE_LEAD_RATIO));
          let ci = Math.floor(ratio * phraseLines.length);
          if (ci >= phraseLines.length) ci = phraseLines.length - 1;
          if (ci !== lastChunkIdx.current) {
            lastChunkIdx.current = ci;
            setLine(phraseLines[ci] ?? "");
          }
        }
        subtitleRafRef.current = requestAnimationFrame(tick);
      };
      subtitleRafRef.current = requestAnimationFrame(tick);
    },
    [cancelSubtitleRaf],
  );

  React.useEffect(() => {
    return () => {
      Object.values(narrationUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
      const au = answerBlobUrlRef.current;
      if (au) URL.revokeObjectURL(au);
      if (bookmarkErrorTimerRef.current) clearTimeout(bookmarkErrorTimerRef.current);
    };
  }, []);

  const refresh = React.useCallback(async () => {
    const t = getToken();
    if (!t) return;
    const [up, tut] = await Promise.all([apiListUploads(t), apiListTutorSessions(t)]);
    setUploads(up.uploads);
    setSessions(tut.sessions);
    setMaxSessions(tut.maxSessions);
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
    if (!selectedUploadId && completed.length > 0) {
      setSelectedUploadId(completed[0].id);
    }
  }, [completed, selectedUploadId]);

  function stopQuestionMicStream() {
    questionMicStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    questionMicStreamRef.current = null;
  }

  async function stopCam() {
    if (focusTimerRef.current) {
      clearInterval(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    stopQuestionMicStream();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
    setFocus(null);
  }

  React.useEffect(() => {
    return () => {
      void stopCam();
    };
  }, []);

  async function startCam() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      setCamOn(true);
    } catch {
      setError("Camera (and mic for questions) permission is required for focus detection and voice Q&A.");
    }
  }

  React.useEffect(() => {
    if (!alertSounds || !camOn) return;
    const Ctor =
      typeof window !== "undefined" &&
      (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return;
    const ctx = new Ctor();
    const id = window.setInterval(() => {
      const f = focusRef.current;
      if (!f) return;
      if (f.status === "BAD FRAME") return;
      if (f.status === "CALIBRATING" || f.focusVal === null) return;
      if (f.status === "FOCUSED" && !f.alarm) return;
      const urgent =
        f.alarm ||
        !f.faceFound ||
        f.status === "NO FACE" ||
        f.status === "NOT FOCUSED" ||
        f.status === "WAKE UP" ||
        f.status === "HEAD DOWN" ||
        f.status === "PLEASE BLINK";
      const soft = f.status === "DISTRACTED";
      if (!urgent && !soft) return;
      if (soft && !urgent) {
        softBeepTickRef.current += 1;
        if (softBeepTickRef.current % 3 !== 0) return;
      } else {
        softBeepTickRef.current = 0;
      }
      void ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = urgent ? 880 : 520;
      g.gain.value = urgent ? 0.11 : 0.055;
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (urgent ? 0.12 : 0.08));
    }, 400);
    return () => {
      window.clearInterval(id);
      void ctx.close();
    };
  }, [alertSounds, camOn]);

  async function captureFrame(): Promise<Blob | null> {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return null;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0);
    return new Promise((resolve) => {
      c.toBlob((b) => resolve(b), "image/jpeg", 0.72);
    });
  }

  React.useEffect(() => {
    if (!activeSession || !camOn) {
      if (focusTimerRef.current) {
        clearInterval(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      return;
    }

    const sid = activeSession.id;
    const t = getToken();
    if (!t) return;

    const tick = async () => {
      const blob = await captureFrame();
      if (!blob) return;
      try {
        const f = await apiTutorFocusAnalyze(t, sid, blob);
        setFocus(f);
      } catch {
        /* avoid spamming UI */
      }
    };

    void tick();
    focusTimerRef.current = setInterval(() => void tick(), 480);

    return () => {
      if (focusTimerRef.current) {
        clearInterval(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [activeSession, camOn]);

  React.useEffect(() => {
    const s = activeSession;
    const tok = getToken();
    if (!s || !tok) return;
    const n = s.slides.length;
    const want = [slideIndex, slideIndex + 1, slideIndex - 1].filter((i) => i >= 0 && i < n);
    let cancelled = false;
    void (async () => {
      for (const i of want) {
        if (cancelled) break;
        const key = `${s.id}:${i}`;
        if (narrationUrlsRef.current[key]) continue;
        try {
          const url = await apiFetchTutorSlideAudioBlobUrl(tok, s.id, i);
          if (cancelled) {
            URL.revokeObjectURL(url);
            break;
          }
          setNarrationUrls((prev) => (prev[key] ? prev : { ...prev, [key]: url }));
        } catch {
          /* prefetch optional */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSession?.id, slideIndex, activeSession?.slides.length]);

  React.useEffect(() => {
    setEli5Script(null);
    setEli5ForSlideIndex(null);
    setNarrationUrls((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (k.includes(":eli5")) {
          URL.revokeObjectURL(next[k]!);
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [slideIndex, activeSession?.id]);

  async function openSession(s: TutorSessionDTO) {
    stopNarration();
    setError(null);
    setLastQa(null);
    if (answerAudioUrl) {
      URL.revokeObjectURL(answerAudioUrl);
      setAnswerAudioUrl(null);
    }
    setActiveSession(s);
    setSlideIndex(0);
    setFocus(null);
    const t = getToken();
    if (t) {
      try {
        await apiTutorFocusReset(t, s.id);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not reset focus tracker. Is the tutor Python service running on port 5002?",
        );
      }
    }
    if (!camOn) await startCam();
  }

  async function onCreateSession() {
    setError(null);
    const t = getToken();
    if (!t) return;
    if (!selectedUploadId) {
      setError("Choose a completed upload first.");
      return;
    }
    setCreating(true);
    try {
      const { session } = await apiCreateTutorSession(t, {
        uploadId: selectedUploadId,
        topicFocus: topicFocus.trim() || undefined,
      });
      setSessions((prev) => [session, ...prev]);
      await openSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create tutor session.");
    } finally {
      setCreating(false);
    }
  }

  async function onDeleteSession(id: string) {
    setError(null);
    const t = getToken();
    if (!t) return;
    try {
      await apiDeleteTutorSession(t, id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSession?.id === id) {
        setActiveSession(null);
        void stopCam();
      }
      const prefix = `${id}:`;
      setNarrationUrls((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.startsWith(prefix)) {
            URL.revokeObjectURL(next[k]!);
            delete next[k];
          }
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete session.");
    }
  }

  const slide = activeSession?.slides[slideIndex];

  const saveBookmarkFromSubtitle = React.useCallback(
    async (source: "narration" | "qa_answer") => {
      if (!activeSession) return;
      let lineText = "";
      if (source === "narration") {
        if (eli5ForSlideIndex === slideIndex && eli5Script?.trim()) {
          lineText = eli5Script.trim();
        } else {
          lineText = (slide?.script ?? "").trim();
        }
      } else {
        lineText = (lastQa?.answer ?? "").trim();
      }
      if (!lineText) return;
      const t = getToken();
      if (!t) return;
      setBookmarkNotice(null);
      if (bookmarkErrorTimerRef.current) {
        clearTimeout(bookmarkErrorTimerRef.current);
        bookmarkErrorTimerRef.current = null;
      }
      setError(null);
      setBookmarkSaving(source);
      try {
        await apiCreateConceptBookmark(t, {
          sourceUploadId: activeSession.sourceUploadId,
          lineText,
          tutorSessionId: activeSession.id,
          slideIndex,
          slideTitle: slide?.title ?? "",
          subtitleSource: source,
        });
        setBookmarkNotice("Saved to Bookmarks — view under Bookmarks in the header.");
        window.setTimeout(() => setBookmarkNotice(null), 3200);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not save bookmark.";
        setError(msg);
        if (/already bookmarked/i.test(msg)) {
          bookmarkErrorTimerRef.current = setTimeout(() => {
            setError((cur) => (cur === msg ? null : cur));
            bookmarkErrorTimerRef.current = null;
          }, 4200);
        }
      } finally {
        setBookmarkSaving(null);
      }
    },
    [activeSession, slideIndex, slide?.title, eli5ForSlideIndex, eli5Script, lastQa],
  );

  const narrationBookmarkText =
    eli5ForSlideIndex === slideIndex && eli5Script?.trim()
      ? eli5Script.trim()
      : (slide?.script ?? "").trim();

  function clearAudioHandlers() {
    cancelSubtitleRaf();
    const a = audioRef.current;
    if (!a) return;
    a.onended = null;
    a.ontimeupdate = null;
    a.onloadedmetadata = null;
    a.onplay = null;
  }

  function bookmarkCurrentAudioProgress() {
    const a = audioRef.current;
    const s = activeSessionRef.current;
    if (!a || !s) return;
    if (audioRoleRef.current === "slide" && playingSlideRef.current !== null && !a.ended) {
      const key = `${s.id}:${playingSlideRef.current}`;
      narrationProgressRef.current[key] = a.currentTime;
    }
  }

  /** Stop all playback and revoke answer audio so Q&A recording starts from a clean state. */
  function haltAllMediaForQuestion() {
    setNarrationLoading(false);
    const a = audioRef.current;
    const s = activeSessionRef.current;

    if (a && s && audioRoleRef.current === "slide" && playingSlideRef.current !== null && !a.ended) {
      const idx = playingSlideRef.current;
      const key = `${s.id}:${idx}`;
      narrationProgressRef.current[key] = a.currentTime;
      lectureResumeRef.current = { slideIndex: idx, key, time: a.currentTime };
    }

    const au = answerBlobUrlRef.current;
    if (au) {
      URL.revokeObjectURL(au);
      answerBlobUrlRef.current = null;
    }
    setAnswerAudioUrl(null);
    lastAnswerTtsTextRef.current = "";
    answerResumeTimeRef.current = 0;
    setAnswerPaused(false);

    cancelSubtitleRaf();
    clearAudioHandlers();
    audioRoleRef.current = null;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setPlayingSlide(null);
    setPlayingAnswer(false);
    setNarrationSubtitleLine("");
    setAnswerSubtitleLine("");
  }

  function pauseAnswerPlayback() {
    const a = audioRef.current;
    if (!a || audioRoleRef.current !== "answer") return;
    if (!playingAnswer) return;
    answerResumeTimeRef.current = a.currentTime;
    a.pause();
    cancelSubtitleRaf();
    setPlayingAnswer(false);
    setAnswerPaused(true);
  }

  /** Pause whatever is on the audio element but keep answer blob URLs for later replay. */
  function haltPlaybackForEli5() {
    const a = audioRef.current;
    const s = activeSessionRef.current;
    if (a && s && audioRoleRef.current === "slide" && playingSlideRef.current !== null && !a.ended) {
      const idx = playingSlideRef.current;
      narrationProgressRef.current[`${s.id}:${idx}`] = a.currentTime;
    }
    if (a && audioRoleRef.current === "answer") {
      answerResumeTimeRef.current = a.currentTime;
      setAnswerPaused(true);
      setPlayingAnswer(false);
    }
    lectureResumeRef.current = null;
    cancelSubtitleRaf();
    clearAudioHandlers();
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    audioRoleRef.current = null;
    setPlayingSlide(null);
    setNarrationSubtitleLine("");
    setAnswerSubtitleLine("");
  }

  async function playOneShotAck(ackObjectUrl: string): Promise<void> {
    const a = audioRef.current;
    if (!a) {
      URL.revokeObjectURL(ackObjectUrl);
      return;
    }
    try {
      cancelSubtitleRaf();
      clearAudioHandlers();
      audioRoleRef.current = null;
      a.pause();
      a.src = ackObjectUrl;
      await new Promise<void>((resolve, reject) => {
        a.onended = () => {
          a.onended = null;
          a.onerror = null;
          resolve();
        };
        a.onerror = () => {
          a.onended = null;
          a.onerror = null;
          reject(new Error("Ack audio failed"));
        };
        void a.play().catch((err) => reject(err instanceof Error ? err : new Error(String(err))));
      });
    } finally {
      URL.revokeObjectURL(ackObjectUrl);
      a.pause();
      a.onended = null;
      a.onerror = null;
      a.removeAttribute("src");
      a.load();
    }
  }

  async function startExplainLikeImFive() {
    const s = activeSession;
    const t = getToken();
    if (!s || !t || eli5Busy || questionSubmitting) return;
    const idx = slideIndex;
    const slide = s.slides[idx];
    if (!slide) return;
    setEli5Busy(true);
    setError(null);
    try {
      haltPlaybackForEli5();
      const eli5Promise = apiTutorSlideEli5(t, s.id, idx);
      const ackUrl = await apiFetchTutorTtsBlobUrl(t, ELI5_ACK_TEXT);
      const [eli5Res] = await Promise.all([eli5Promise, playOneShotAck(ackUrl)]);
      setEli5Script(eli5Res.script);
      setEli5ForSlideIndex(idx);
      const key = `${s.id}:${idx}`;
      narrationProgressRef.current[key] = 0;
      setNarrationUrls((prev) => {
        const k = `${key}:eli5`;
        if (!prev[k]) return prev;
        const next = { ...prev };
        URL.revokeObjectURL(next[k]!);
        delete next[k];
        return next;
      });
      await playNarration(idx, { scriptOverride: eli5Res.script, treatAsEli5: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare a simpler explanation.");
    } finally {
      setEli5Busy(false);
    }
  }

  async function playNarration(
    idx: number,
    opts?: { scriptOverride?: string; treatAsEli5?: boolean },
  ) {
    const s = activeSession;
    const t = getToken();
    if (!s || !t) return;
    const key = `${s.id}:${idx}`;
    const slideScript = s.slides[idx]?.script ?? "";
    const scriptText =
      opts?.scriptOverride !== undefined && opts.scriptOverride.length > 0
        ? opts.scriptOverride
        : eli5ForSlideIndex === idx && eli5Script
          ? eli5Script
          : slideScript;
    const isEli5Track =
      opts?.treatAsEli5 === true ||
      (eli5ForSlideIndex === idx && eli5Script !== null && scriptText === eli5Script);
    const audioKey = isEli5Track ? `${key}:eli5` : key;
    setNarrationLoading(true);
    setPlayingSlide(idx);
    setPlayingAnswer(false);
    setAnswerPaused(false);
    setAnswerSubtitleLine("");
    setError(null);
    const words = tokenizeScript(scriptText);
    setNarrationSubtitleLine("");
    try {
      let url = narrationUrlsRef.current[audioKey];
      if (!url) {
        url = isEli5Track
          ? await apiFetchTutorTtsBlobUrl(t, scriptText)
          : await apiFetchTutorSlideAudioBlobUrl(t, s.id, idx);
        setNarrationUrls((prev) => ({ ...prev, [audioKey]: url! }));
      }
      const a = audioRef.current;
      if (a) {
        clearAudioHandlers();
        audioRoleRef.current = "slide";
        a.src = url;
        const saved = narrationProgressRef.current[audioKey] ?? 0;
        const onReady = () => {
          const dur = a.duration;
          if (saved > 0.2 && Number.isFinite(dur) && dur > 0 && saved < dur - 0.12) {
            a.currentTime = saved;
          }
          attachSubtitleRaf(a, words, setNarrationSubtitleLine);
        };
        if (a.readyState >= 1) {
          onReady();
        } else {
          a.onloadedmetadata = () => {
            a.onloadedmetadata = null;
            onReady();
          };
        }
        a.ontimeupdate = () => {
          narrationProgressRef.current[audioKey] = a.currentTime;
        };
        a.onended = () => {
          clearAudioHandlers();
          audioRoleRef.current = null;
          setPlayingSlide(null);
          setNarrationSubtitleLine("");
          narrationProgressRef.current[audioKey] = 0;
          if (!autoAdvanceRef.current) return;
          const sess = activeSessionRef.current;
          if (!sess) return;
          const next = idx + 1;
          if (next < sess.slides.length) {
            setSlideIndex(next);
            void playNarration(next);
          }
        };
        await a.play();
      }
    } catch (e) {
      clearAudioHandlers();
      audioRoleRef.current = null;
      setPlayingSlide(null);
      setNarrationSubtitleLine("");
      setError(
        e instanceof Error
          ? e.message
          : "Could not play narration. Make sure the tutor voice helper is running, then try again.",
      );
    } finally {
      setNarrationLoading(false);
    }
  }

  async function resumeLectureAfterAnswer() {
    const saved = lectureResumeRef.current;
    lectureResumeRef.current = null;
    if (!saved) return;
    if (slideIndexRef.current !== saved.slideIndex) return;
    if (!narrationUrlsRef.current[saved.key]) return;
    narrationProgressRef.current[saved.key] = saved.time;
    await playNarration(saved.slideIndex);
  }

  function stopNarration() {
    bookmarkCurrentAudioProgress();
    lectureResumeRef.current = null;
    const au = answerBlobUrlRef.current;
    if (au) {
      URL.revokeObjectURL(au);
      answerBlobUrlRef.current = null;
    }
    setAnswerAudioUrl(null);
    lastAnswerTtsTextRef.current = "";
    answerResumeTimeRef.current = 0;
    setAnswerPaused(false);
    const a = audioRef.current;
    clearAudioHandlers();
    audioRoleRef.current = null;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setPlayingSlide(null);
    setPlayingAnswer(false);
    setNarrationSubtitleLine("");
    setAnswerSubtitleLine("");
  }

  async function playAnswerTts(text: string, opts?: { onEnded?: () => void }) {
    const tok = getToken();
    if (!tok) return;
    const a = audioRef.current;
    if (!a) return;

    const bufferedSame = !!answerBlobUrlRef.current && lastAnswerTtsTextRef.current === text;
    if (bufferedSame) {
      if (!a.paused && !a.ended) return;
      if (audioRoleRef.current === "slide") {
        a.pause();
        cancelSubtitleRaf();
      }
      clearAudioHandlers();
      setPlayingSlide(null);
      setNarrationSubtitleLine("");
      const words = tokenizeScript(text);
      setPlayingAnswer(true);
      setAnswerPaused(false);
      audioRoleRef.current = "answer";
      if (!a.src && answerBlobUrlRef.current) {
        a.src = answerBlobUrlRef.current;
      }
      const resumeT = answerResumeTimeRef.current;
      const seekTo = a.ended || resumeT < 0.12 ? 0 : resumeT;
      const onReady = () => {
        const dur = a.duration;
        if (Number.isFinite(dur) && dur > 0.1) {
          a.currentTime = Math.min(Math.max(0, seekTo), dur - 0.05);
        } else if (seekTo > 0) {
          a.currentTime = seekTo;
        }
        attachSubtitleRaf(a, words, setAnswerSubtitleLine);
      };
      if (a.readyState >= 1) {
        onReady();
      } else {
        a.onloadedmetadata = () => {
          a.onloadedmetadata = null;
          onReady();
        };
      }
      a.ontimeupdate = () => {
        answerResumeTimeRef.current = a.currentTime;
      };
      a.onended = () => {
        clearAudioHandlers();
        audioRoleRef.current = null;
        setPlayingAnswer(false);
        setAnswerPaused(false);
        setAnswerSubtitleLine("");
        answerResumeTimeRef.current = 0;
        opts?.onEnded?.();
      };
      try {
        await a.play();
      } catch {
        setPlayingAnswer(false);
        setAnswerPaused(true);
      }
      return;
    }

    const auOld = answerBlobUrlRef.current;
    if (auOld) {
      URL.revokeObjectURL(auOld);
      answerBlobUrlRef.current = null;
    }
    setAnswerAudioUrl(null);

    const aSlide = audioRef.current;
    if (aSlide && audioRoleRef.current === "slide") {
      aSlide.pause();
      cancelSubtitleRaf();
    }
    clearAudioHandlers();

    setPlayingSlide(null);
    setNarrationSubtitleLine("");
    const words = tokenizeScript(text);
    setAnswerSubtitleLine("");
    lastAnswerTtsTextRef.current = text;
    answerResumeTimeRef.current = 0;
    try {
      const url = await apiFetchTutorTtsBlobUrl(tok, text);
      answerBlobUrlRef.current = url;
      setAnswerAudioUrl(url);
      const ap = audioRef.current;
      if (ap) {
        audioRoleRef.current = "answer";
        setPlayingAnswer(true);
        setAnswerPaused(false);
        ap.src = url;
        const onReady = () => {
          attachSubtitleRaf(ap, words, setAnswerSubtitleLine);
        };
        if (ap.readyState >= 1) {
          onReady();
        } else {
          ap.onloadedmetadata = () => {
            ap.onloadedmetadata = null;
            onReady();
          };
        }
        ap.ontimeupdate = () => {
          answerResumeTimeRef.current = ap.currentTime;
        };
        ap.onended = () => {
          clearAudioHandlers();
          audioRoleRef.current = null;
          setPlayingAnswer(false);
          setAnswerPaused(false);
          setAnswerSubtitleLine("");
          answerResumeTimeRef.current = 0;
          opts?.onEnded?.();
        };
        await ap.play();
      }
    } catch (e) {
      setPlayingAnswer(false);
      setAnswerSubtitleLine("");
      lastAnswerTtsTextRef.current = "";
      setError(e instanceof Error ? e.message : "Could not play answer audio.");
      opts?.onEnded?.();
    }
  }

  function buildMediaRecorder(stream: MediaStream): MediaRecorder | null {
    if (typeof MediaRecorder === "undefined") return null;
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
    ];
    for (const mimeType of types) {
      if (!MediaRecorder.isTypeSupported(mimeType)) continue;
      try {
        return new MediaRecorder(stream, { mimeType });
      } catch {
        continue;
      }
    }
    try {
      return new MediaRecorder(stream);
    } catch {
      return null;
    }
  }

  async function toggleQuestionRecording() {
    if (!camOn || questionSubmitting) return;
    if (asking) {
      await finishQuestionRecording();
      return;
    }
    await startAskRecording();
  }

  async function startAskRecording() {
    if (typeof MediaRecorder === "undefined") {
      setError("This browser does not support recording your question here. Try Chrome or Edge on a computer.");
      return;
    }
    if (asking) return;
    setError(null);
    haltAllMediaForQuestion();
    setLastQa(null);
    recordChunksRef.current = [];
    stopQuestionMicStream();

    const attachAndStart = (stream: MediaStream, fromDedicatedMic: boolean): boolean => {
      const rec = buildMediaRecorder(stream);
      if (!rec) return false;
      try {
        rec.ondataavailable = (ev) => {
          if (ev.data.size) recordChunksRef.current.push(ev.data);
        };
        rec.start(200);
        recorderRef.current = rec;
        if (fromDedicatedMic) questionMicStreamRef.current = stream;
        setAsking(true);
        return true;
      } catch {
        return false;
      }
    };

    const combined = streamRef.current;
    if (combined?.getAudioTracks().length) {
      if (attachAndStart(combined, false)) return;
    }

    try {
      const audioOnly = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (attachAndStart(audioOnly, true)) return;
      audioOnly.getTracks().forEach((tr) => tr.stop());
    } catch {
      setError(
        "We could not use the microphone. Allow mic access for this site, turn the camera on first, or try another browser.",
      );
      return;
    }

    setError("Recording could not start. Try Chrome or Edge, or refresh the page.");
  }

  async function finishQuestionRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      setAsking(false);
      stopQuestionMicStream();
      return;
    }
    const t = getToken();
    const s = activeSession;
    const idx = slideIndex;
    await new Promise<void>((resolve) => {
      rec.addEventListener("stop", () => resolve(), { once: true });
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    setAsking(false);
    recorderRef.current = null;
    stopQuestionMicStream();
    if (!t || !s) return;
    await new Promise<void>((r) => setTimeout(r, 80));
    const chunks = recordChunksRef.current;
    recordChunksRef.current = [];
    const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
    if (blob.size < 32) {
      setError("Recording too short — tap Record, speak, then tap Stop & send when you are done.");
      void resumeLectureAfterAnswer();
      return;
    }
    setError(null);
    setQuestionSubmitting(true);
    try {
      const qa = await apiTutorAsk(t, { sessionId: s.id, slideIndex: idx, audio: blob });
      setLastQa(qa);
      await playAnswerTts(qa.answer, { onEnded: () => void resumeLectureAfterAnswer() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process your question.");
      void resumeLectureAfterAnswer();
    } finally {
      setQuestionSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">AI tutor room</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Acadomi turns your own study notes into a calm, guided lesson you can listen to like a video call.
            Pick material you have already uploaded, open a session, and let the tutor talk you through each
            slide. Your camera helps us cheer you on when you stay with it—and gently nudge you when attention
            drifts. Ask a question out loud anytime; the tutor answers in plain language.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {bookmarkNotice ? (
          <Alert className="border-primary/40 bg-primary/5">
            <AlertTitle className="text-primary">Bookmark</AlertTitle>
            <AlertDescription>{bookmarkNotice}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <GraduationCap className="size-5 text-primary" aria-hidden />
                  <CardTitle className="text-lg">New session</CardTitle>
                </div>
                <CardDescription>
                  Choose notes you have already added on the{" "}
                  <Link href="/upload" className="font-medium text-primary underline-offset-4 hover:underline">
                    Uploads
                  </Link>{" "}
                  page (only finished items appear here). Optional: narrow the topic so the lesson stays on what
                  matters to you. If your school runs the optional tutor helper app, keep that running so voice
                  and focus features work smoothly.
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
                    No completed uploads yet. Process a file first, then return here.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="tutor-upload">Material</Label>
                      <select
                        id="tutor-upload"
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
                      <Label htmlFor="tutor-focus">Optional focus (chapter, exam topic…)</Label>
                      <input
                        id="tutor-focus"
                        className={cn(
                          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        value={topicFocus}
                        onChange={(e) => setTopicFocus(e.target.value)}
                        placeholder="e.g. Chapter 3 only"
                        maxLength={400}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={creating || !selectedUploadId}
                      onClick={() => void onCreateSession()}
                    >
                      {creating ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Building slides…
                        </>
                      ) : (
                        "Start Meet-style session"
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Up to {maxSessions} saved sessions. Delete old ones to free a slot.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Your sessions</CardTitle>
                <CardDescription>
                  Open a saved room to continue, or start fresh above. Delete old rooms anytime to make space.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sessions yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {sessions.map((s) => (
                      <li
                        key={s.id}
                        className={cn(
                          "flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between",
                          activeSession?.id === s.id && "border-primary ring-1 ring-primary/30",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.displayTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.slides.length} slides ·{" "}
                            {new Date(s.updatedAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" variant="secondary" onClick={() => void openSession(s)}>
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void onDeleteSession(s.id)}
                            aria-label="Delete session"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            {!activeSession ? (
              <Card className="border-dashed border-border">
                <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                  <Video className="size-10 opacity-50" />
                  <p className="text-sm">Create or open a session to see your lesson, narration, and focus tools.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]">
                  <Card className="min-w-0 border-border shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-lg leading-tight">
                          Slide {slideIndex + 1} / {activeSession.slides.length}
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">
                          {activeSession.topicFocus ? `Focus: ${activeSession.topicFocus}` : "Full material"}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {slide ? (
                        <>
                          <h2 className="text-xl font-semibold tracking-tight text-primary">{slide.title}</h2>
                          <ul className="list-inside list-disc space-y-1 text-sm text-foreground/90">
                            {slide.points.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-medium text-muted-foreground">What the tutor is saying</p>
                              {eli5ForSlideIndex === slideIndex && eli5Script ? (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                                  Simple words mode
                                </span>
                              ) : null}
                            </div>
                            <div
                              className={cn(
                                "relative flex min-h-[3rem] items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-2 py-2.5 text-center",
                                playingSlide === slideIndex && narrationSubtitleLine && "border-primary/40 bg-primary/5",
                                eli5ForSlideIndex === slideIndex && eli5Script && "border-amber-500/30 bg-amber-500/5",
                              )}
                              aria-live="polite"
                            >
                              <button
                                type="button"
                                className={cn(
                                  "absolute right-1.5 top-1.5 z-10 inline-flex size-8 items-center justify-center rounded-md border border-border/60 bg-background/90 text-muted-foreground shadow-sm transition-colors",
                                  "hover:border-primary/40 hover:bg-accent hover:text-foreground",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  "disabled:pointer-events-none disabled:opacity-40",
                                )}
                                aria-label="Bookmark full narration for this slide"
                                title="Save full narration for this slide to Bookmarks"
                                disabled={
                                  !narrationBookmarkText ||
                                  !activeSession ||
                                  bookmarkSaving !== null
                                }
                                onClick={() => void saveBookmarkFromSubtitle("narration")}
                              >
                                {bookmarkSaving === "narration" ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Plus className="size-4" />
                                )}
                              </button>
                              <p className="w-full max-w-full break-words pr-11 text-sm font-medium leading-snug text-foreground sm:text-base">
                                {playingSlide === slideIndex && narrationSubtitleLine
                                  ? narrationSubtitleLine
                                  : playingSlide === slideIndex
                                    ? "…"
                                    : eli5ForSlideIndex === slideIndex && eli5Script
                                      ? "Tap Play — simpler explanation is ready (resets when you change slide)."
                                      : "Tap Play — words follow the voice in real time."}
                              </p>
                            </div>
                          </div>
                        </>
                      ) : null}
                      <div className="flex flex-col gap-3 border-t border-border pt-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="size-3.5 rounded border-input accent-primary"
                              checked={autoAdvanceNarration}
                              onChange={(e) => setAutoAdvanceNarration(e.target.checked)}
                            />
                            Auto-advance slide when narration ends
                          </label>
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="size-3.5 rounded border-input accent-primary"
                              checked={alertSounds}
                              onChange={(e) => setAlertSounds(e.target.checked)}
                            />
                            Focus alert beeps until you are focused
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={slideIndex <= 0}
                          onClick={() => {
                            stopNarration();
                            setSlideIndex((i) => Math.max(0, i - 1));
                          }}
                        >
                          <ChevronLeft className="mr-1 size-4" />
                          Prev
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={slideIndex >= activeSession.slides.length - 1}
                          onClick={() => {
                            stopNarration();
                            setSlideIndex((i) => Math.min(activeSession.slides.length - 1, i + 1));
                          }}
                        >
                          Next
                          <ChevronRight className="ml-1 size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-primary text-primary-foreground"
                          disabled={narrationLoading || !slide || eli5Busy}
                          onClick={() => void playNarration(slideIndex)}
                        >
                          {narrationLoading && playingSlide === slideIndex ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Play className="mr-2 size-4" />
                          )}
                          Play narration
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            !slide ||
                            eli5Busy ||
                            narrationLoading ||
                            questionSubmitting ||
                            asking
                          }
                          onClick={() => void startExplainLikeImFive()}
                          title="Stops current audio, then a short reply plays while a simpler script is generated"
                        >
                          {eli5Busy ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Baby className="mr-2 size-4" />
                          )}
                          Explain like I&apos;m 5
                        </Button>
                        {playingSlide !== null || playingAnswer ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (playingAnswer) pauseAnswerPlayback();
                              else stopNarration();
                            }}
                          >
                            <Square className="mr-2 size-4" />
                            Pause playback
                          </Button>
                        ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="min-w-0 space-y-4 xl:max-w-[22rem] xl:justify-self-end">
                    <Card
                      className={cn(
                        "min-w-0 overflow-hidden border-border shadow-sm",
                        focus?.alarm && "border-destructive ring-1 ring-destructive/40",
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <ScanEye className="size-5 text-primary" />
                          <CardTitle className="text-base">You</CardTitle>
                        </div>
                        <CardDescription>
                          Turn your camera on so Acadomi can celebrate focus and offer gentle reminders.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
                          <video
                            ref={videoRef}
                            className="h-full w-full object-cover"
                            playsInline
                            muted
                            autoPlay
                          />
                          {!camOn ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-xs text-white">
                              Camera off
                            </div>
                          ) : null}
                        </div>
                        <canvas ref={canvasRef} className="hidden" aria-hidden />
                        <div className="flex flex-wrap gap-2">
                          {!camOn ? (
                            <Button type="button" size="sm" onClick={() => void startCam()}>
                              <Video className="mr-2 size-4" />
                              Enable camera &amp; mic
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="outline" onClick={() => void stopCam()}>
                              <VideoOff className="mr-2 size-4" />
                              Stop camera
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Focus</CardTitle>
                        <CardDescription>
                          Live readout of how present you look on camera. Numbers update as you learn; use them
                          as feedback, not a grade.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div
                          className={cn(
                            "rounded-lg border border-border px-3 py-3 text-center text-sm font-semibold",
                            focusTone(focus),
                          )}
                        >
                          {focus ? (
                            <>
                              <div className="text-lg tracking-tight">{focus.status}</div>
                              {focus.focusVal !== null ? (
                                <div className="mt-1 font-mono text-2xl tabular-nums">
                                  {focus.focusVal}
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">/ 100</span>
                                </div>
                              ) : (
                                <p className="mt-1 text-xs font-normal opacity-80">
                                  Calibrating…{" "}
                                  {focus.calibrationProgress != null
                                    ? `${Math.round(focus.calibrationProgress * 100)}%`
                                    : "hold still"}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">Waiting for camera…</span>
                          )}
                        </div>
                        {focus && !focus.faceFound ? (
                          <p className="text-xs text-muted-foreground">
                            Stay centered in frame so we can estimate attention.
                          </p>
                        ) : null}
                        {focus && (focus.pitch != null || focus.ear != null) ? (
                          <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Live metrics
                            </p>
                            <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[11px] font-mono leading-tight">
                              {(
                                [
                                  ["Pitch°", focus.pitch],
                                  ["Yaw°", focus.yaw],
                                  ["Roll°", focus.roll],
                                  ["Δ pitch", focus.deltaPitch],
                                  ["Δ yaw", focus.deltaYaw],
                                  ["Baseline pitch", focus.baselinePitch],
                                  ["Baseline yaw", focus.baselineYaw],
                                  ["EAR", focus.ear],
                                  ["Baseline EAR", focus.baselineEar],
                                  ["Δ EAR", focus.deltaEar],
                                  ["Gaze var×10⁴", focus.gazeVariance],
                                  ["Blink Δt s", focus.timeSinceBlinkSec],
                                  ["Gaze move Δt s", focus.timeSinceGazeMoveSec],
                                  ["Pose score", focus.poseScore],
                                  ["Eye score", focus.eyeScore],
                                  ["Gaze score", focus.gazeScore],
                                  ["Raw focus", focus.rawFocus],
                                  ["Stare alarm", focus.stareAlarm],
                                ] as const
                              )
                                .filter(([, v]) => v !== undefined && v !== null)
                                .map(([k, v]) => (
                                  <React.Fragment key={k}>
                                    <dt className="text-muted-foreground">{k}</dt>
                                    <dd className="text-right text-foreground">{String(v)}</dd>
                                  </React.Fragment>
                                ))}
                            </dl>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <Card className="border-border shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Mic className="size-5 text-primary" />
                      <CardTitle className="text-lg">Ask a question</CardTitle>
                    </div>
                    <CardDescription>
                      Tap <strong>Record</strong> to start—narration and any answer audio stop so the mic is
                      clear. Speak your whole question, then tap <strong>Stop &amp; send</strong> to get the
                      tutor&apos;s reply. Use Chrome or Edge on a laptop if anything fails.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={asking ? "destructive" : "secondary"}
                        disabled={!camOn || questionSubmitting}
                        onClick={() => void toggleQuestionRecording()}
                      >
                        {questionSubmitting ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Getting answer…
                          </>
                        ) : asking ? (
                          <>
                            <Square className="mr-2 size-4" />
                            Stop &amp; send
                          </>
                        ) : (
                          <>
                            <Mic className="mr-2 size-4" />
                            Record question
                          </>
                        )}
                      </Button>
                      {asking ? (
                        <span className="text-xs text-muted-foreground">Recording… tap Stop when finished.</span>
                      ) : null}
                    </div>
                    {lastQa ? (
                      <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
                        <p>
                          <span className="font-medium text-foreground">You asked: </span>
                          {lastQa.question}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Tutor: </span>
                          {playingAnswer ? (
                            <span className="text-muted-foreground">Playing—subtitles match phrases below.</span>
                          ) : (
                            lastQa.answer
                          )}
                        </p>
                        {(playingAnswer || answerPaused) && answerSubtitleLine ? (
                          <div
                            className="relative flex min-h-[2.75rem] items-center justify-center rounded-lg border border-dashed border-primary/35 bg-primary/5 px-3 py-2 text-center"
                            aria-live="polite"
                          >
                            <button
                              type="button"
                              className={cn(
                                "absolute right-1.5 top-1.5 z-10 inline-flex size-8 items-center justify-center rounded-md border border-primary/25 bg-background/95 text-muted-foreground shadow-sm transition-colors",
                                "hover:border-primary/50 hover:bg-accent hover:text-foreground",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                "disabled:pointer-events-none disabled:opacity-40",
                              )}
                              aria-label="Bookmark full tutor answer"
                              title="Save the full answer text to Bookmarks"
                              disabled={
                                !activeSession ||
                                !lastQa?.answer?.trim() ||
                                bookmarkSaving !== null
                              }
                              onClick={() => void saveBookmarkFromSubtitle("qa_answer")}
                            >
                              {bookmarkSaving === "qa_answer" ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Plus className="size-4" />
                              )}
                            </button>
                            <p className="max-w-full break-words pr-10 text-sm font-medium text-foreground">
                              {answerSubtitleLine}
                            </p>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {playingAnswer ? (
                            <Button type="button" variant="outline" size="sm" onClick={pauseAnswerPlayback}>
                              <Square className="mr-2 size-4" />
                              Pause answer
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={questionSubmitting}
                              onClick={() => void playAnswerTts(lastQa.answer)}
                            >
                              <Volume2 className="mr-2 size-4" />
                              {answerPaused ? "Resume answer" : "Hear answer"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <audio ref={audioRef} className="hidden" />

                <div className="pointer-events-none fixed bottom-20 right-4 z-40 md:bottom-10 md:right-6 print:hidden">
                  <div className="pointer-events-auto flex flex-col items-center gap-1">
                    <span className="rounded-md bg-background/95 px-2 py-0.5 text-center text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-border">
                      Ask
                    </span>
                    <Button
                      type="button"
                      title={asking ? "Stop recording and send question" : "Start recording your question"}
                      aria-label={
                        asking ? "Stop recording and send your question" : "Start recording your question"
                      }
                      variant={asking ? "destructive" : "default"}
                      size="icon"
                      className="size-14 rounded-full shadow-lg ring-2 ring-background"
                      disabled={!camOn || questionSubmitting}
                      onClick={() => void toggleQuestionRecording()}
                    >
                      {questionSubmitting ? (
                        <Loader2 className="size-6 animate-spin" aria-hidden />
                      ) : asking ? (
                        <Square className="size-6" aria-hidden />
                      ) : (
                        <Mic className="size-6" aria-hidden />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
