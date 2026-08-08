"use client";

/**
 * Patient voice agent widget.
 *
 * Visual design adapted from kokonutui's AI Voice component
 * (https://kokonutui.com, MIT licensed, https://github.com/kokonut-labs/kokonutui) —
 * the demo auto-cycle has been removed and the mic button / waveform / timer
 * now reflect a real Gemini Live connection driven by useVoiceAgent.
 */

import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useApiActor } from "@/lib/use-api-actor";
import { useVoiceAgent } from "@/hooks/use-voice-agent";

const BAR_COUNT = 48;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function VoiceAgentWidget() {
  const t = useTranslations("voiceAgent");
  const actor = useApiActor();
  const { state, errorMessage, start, stop } = useVoiceAgent(actor);
  const active = state === "listening" || state === "speaking";

  const [time, setTime] = useState(0);
  const [barHeights, setBarHeights] = useState<number[]>(() => Array(BAR_COUNT).fill(20));
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      return;
    }
    startedAtRef.current = Date.now();
    const intervalId = setInterval(() => {
      const startedAt = startedAtRef.current ?? Date.now();
      setTime(Math.floor((Date.now() - startedAt) / 1000));
      setBarHeights(Array.from({ length: BAR_COUNT }, () => 20 + Math.random() * 80));
    }, 300);
    return () => clearInterval(intervalId);
  }, [active]);

  function handleClick() {
    if (state === "idle" || state === "error") {
      start();
    } else {
      stop();
    }
  }

  const statusText =
    state === "connecting"
      ? t("connecting")
      : state === "listening"
        ? t("listening")
        : state === "speaking"
          ? t("speaking")
          : state === "error"
            ? errorMessage || t("error")
            : t("clickToSpeak");

  return (
    <div className="w-full py-4">
      <div className="relative mx-auto flex w-full max-w-xl flex-col items-center gap-2">
        <button
          className={cn(
            "group flex h-16 w-16 items-center justify-center rounded-xl transition-colors",
            active ? "bg-none" : "bg-none hover:bg-black/5 dark:hover:bg-white/5"
          )}
          onClick={handleClick}
          type="button"
          disabled={!actor}
          aria-label={statusText}
        >
          {state === "connecting" ? (
            <Loader2 className="h-6 w-6 animate-spin text-black/90 dark:text-white/90" />
          ) : active ? (
            <div
              className="pointer-events-auto h-6 w-6 animate-spin cursor-pointer rounded-sm bg-black dark:bg-white"
              style={{ animationDuration: "3s" }}
            />
          ) : state === "error" ? (
            <AlertCircle className="h-6 w-6 text-[#B42318]" />
          ) : (
            <Mic className="h-6 w-6 text-black/90 dark:text-white/90" />
          )}
        </button>

        <span
          className={cn(
            "font-mono text-sm transition-opacity duration-300",
            active ? "text-black/70 dark:text-white/70" : "text-black/30 dark:text-white/30"
          )}
        >
          {active ? formatTime(time) : "00:00"}
        </span>

        <div className="flex h-4 w-64 items-center justify-center gap-0.5">
          {barHeights.map((height, i) => (
            <div
              className={cn(
                "w-0.5 rounded-full transition-all duration-300",
                active ? "animate-pulse bg-black/50 dark:bg-white/50" : "h-1 bg-black/10 dark:bg-white/10"
              )}
              key={i}
              style={active ? { height: `${height}%`, animationDelay: `${i * 0.05}s` } : undefined}
            />
          ))}
        </div>

        <p
          className={cn(
            "h-4 text-xs",
            state === "error" ? "text-[#B42318]" : "text-black/70 dark:text-white/70"
          )}
        >
          {statusText}
        </p>
      </div>
    </div>
  );
}
