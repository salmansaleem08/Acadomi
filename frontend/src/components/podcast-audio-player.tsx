"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BAR_COUNT = 40;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

type BarMeta = { dur: number; delay: number; minScale: number; keyframes: number[] };

function makeBarMeta(): BarMeta[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const dur = 0.75 + ((i * 17) % 11) / 20;
    const delay = ((i * 41) % 100) / 200;
    const minScale = 0.22 + ((i * 23) % 9) / 100;
    const k = i % 4;
    const keyframes =
      k === 0
        ? [minScale, 1, 0.38, 0.88, minScale]
        : k === 1
          ? [minScale, 0.72, 1, 0.5, minScale]
          : k === 2
            ? [minScale, 0.9, 0.35, 1, minScale]
            : [minScale, 0.55, 0.95, 0.42, minScale];
    return { dur, delay, minScale, keyframes };
  });
}

export type PodcastAudioPlayerProps = {
  src: string;
  className?: string;
};

export function PodcastAudioPlayer({ src, className }: PodcastAudioPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const barMeta = React.useMemo(() => makeBarMeta(), []);

  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolume] = React.useState(1);
  const [muted, setMuted] = React.useState(false);
  const [seeking, setSeeking] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  const volBeforeMute = React.useRef(1);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.load();
    setReady(false);
    setCurrent(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const seekFromClientX = React.useCallback((clientX: number) => {
    const track = trackRef.current;
    const a = audioRef.current;
    if (!track || !a || !Number.isFinite(a.duration) || a.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = t * a.duration;
  }, []);

  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setSeeking(true);
    seekFromClientX(e.clientX);
  };

  const onTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!seeking) return;
    seekFromClientX(e.clientX);
  };

  const onTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setSeeking(false);
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const togglePlay = React.useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  const skip = React.useCallback((delta: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration)) return;
    a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + delta));
  }, []);

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/90 bg-gradient-to-b from-card via-card to-muted/30 p-4 shadow-sm",
        "dark:border-border dark:from-card dark:via-card dark:to-muted/20",
        "focus-within:ring-[3px] focus-within:ring-ring/40",
        className,
      )}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          togglePlay();
        }
      }}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          setDuration(Number.isFinite(a.duration) ? a.duration : 0);
          setReady(true);
        }}
        onTimeUpdate={(e) => {
          if (!seeking) setCurrent(e.currentTarget.currentTime);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />

      {/* Waveform-style visualizer */}
      <div
        className="mb-4 flex h-[52px] items-end justify-center gap-[3px] rounded-lg bg-muted/40 px-2 py-2 dark:bg-muted/25"
        aria-hidden
      >
        {barMeta.map((bar, i) => (
          <motion.div
            key={i}
            className="h-9 w-[3px] shrink-0 rounded-full bg-primary/85 origin-bottom dark:bg-primary/75 sm:h-10 sm:w-1"
            initial={false}
            animate={
              playing
                ? { scaleY: bar.keyframes }
                : { scaleY: bar.minScale * 1.15 }
            }
            transition={{
              duration: bar.dur,
              repeat: playing ? Infinity : 0,
              delay: playing ? bar.delay : 0,
              ease: "easeInOut",
              times: [0, 0.25, 0.5, 0.75, 1],
            }}
          />
        ))}
      </div>

      {/* Progress */}
      <div className="mb-3 space-y-1.5">
        <div
          ref={trackRef}
          role="slider"
          aria-valuenow={Math.round(current)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-label="Seek"
          tabIndex={0}
          className={cn(
            "group relative h-3 cursor-pointer rounded-full bg-muted/80 py-1 touch-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          onKeyDown={(e) => {
            const a = audioRef.current;
            if (!a || !Number.isFinite(a.duration)) return;
            const step = Math.min(5, a.duration / 20);
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              a.currentTime = Math.max(0, a.currentTime - step);
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              a.currentTime = Math.min(a.duration, a.currentTime + step);
            }
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
          <div
            className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%` }}
          />
          <motion.div
            className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-md"
            style={{ left: `${pct}%` }}
            animate={{ scale: seeking ? 1.15 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          />
        </div>
        <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
          <span>{formatClock(current)}</span>
          <span>{ready ? formatClock(duration) : "—:—"}</span>
        </div>
      </div>

      {/* Transport + volume */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0 border-border/80"
            aria-label="Back 10 seconds"
            onClick={() => skip(-10)}
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="size-12 shrink-0 rounded-full shadow-md"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => void togglePlay()}
          >
            {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0 border-border/80"
            aria-label="Forward 10 seconds"
            onClick={() => skip(10)}
          >
            <SkipForward className="size-4" />
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 sm:ml-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              if (muted) {
                setMuted(false);
                setVolume(volBeforeMute.current || 0.8);
              } else {
                volBeforeMute.current = volume;
                setMuted(true);
              }
            }}
          >
            {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            aria-label="Volume"
            className={cn(
              "podcast-volume h-1.5 min-w-[72px] flex-1 cursor-pointer appearance-none rounded-full bg-muted",
              "accent-primary disabled:opacity-50",
            )}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              setMuted(v === 0);
            }}
          />
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Space to play/pause · arrows on the bar to seek
      </p>
    </div>
  );
}
