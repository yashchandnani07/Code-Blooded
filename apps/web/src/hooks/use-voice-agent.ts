"use client";

/**
 * Drives a live voice conversation with Gemini for a patient.
 *
 * Flow: fetch an ephemeral token + system prompt (with the patient's
 * doctor-released history already inlined) from the backend, open a Gemini
 * Live session directly from the browser using that token, stream mic audio
 * in as 16-bit PCM at 16kHz, and play the model's spoken response back at
 * 24kHz. The backend never sees or proxies audio — see
 * apps/api/api/routes/voice.py and docs/superpowers/plans/2026-08-08-patient-voice-agent.md.
 *
 * Audio worklet processors live in /public/audio-worklets and are adapted
 * from Google's official reference implementation:
 * https://github.com/google-gemini/gemini-live-api-examples/tree/main/gemini-live-ephemeral-tokens-websocket
 */

import { useCallback, useRef, useState } from "react";
import { createVoiceSessionRemote } from "@/lib/api";
import type { ApiActor } from "@/lib/api";

export type VoiceAgentState = "idle" | "connecting" | "listening" | "speaking" | "error";

const CAPTURE_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;

function floatToPCM16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = sample * 0x7fff;
  }
  return int16.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToFloat32(base64: string): Float32Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

interface LiveSession {
  sendRealtimeInput: (input: { audio: { data: string; mimeType: string } }) => void;
  close: () => void;
}

export function useVoiceAgent(actor: ApiActor | null) {
  const [state, setState] = useState<VoiceAgentState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const captureWorkletRef = useRef<AudioWorkletNode | null>(null);
  const playbackWorkletRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const teardown = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    captureWorkletRef.current?.disconnect();
    captureWorkletRef.current = null;
    playbackWorkletRef.current?.disconnect();
    playbackWorkletRef.current = null;

    captureContextRef.current?.close().catch(() => {});
    captureContextRef.current = null;
    playbackContextRef.current?.close().catch(() => {});
    playbackContextRef.current = null;
  }, []);

  const stop = useCallback(() => {
    teardown();
    setState("idle");
  }, [teardown]);

  const start = useCallback(async () => {
    if (!actor) return;
    if (state === "connecting" || state === "listening" || state === "speaking") return;

    setErrorMessage(null);
    setState("connecting");

    try {
      const session = await createVoiceSessionRemote(actor);

      const { GoogleGenAI, Modality } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: session.token });

      const playbackContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: PLAYBACK_SAMPLE_RATE,
      });
      await playbackContext.audioWorklet.addModule("/audio-worklets/playback-processor.js");
      const playbackWorklet = new AudioWorkletNode(playbackContext, "pcm-processor");
      playbackWorklet.connect(playbackContext.destination);
      playbackContextRef.current = playbackContext;
      playbackWorkletRef.current = playbackWorklet;

      const liveSession = await ai.live.connect({
        model: session.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: session.systemPrompt,
        },
        callbacks: {
          onopen: () => setState("listening"),
          onmessage: (message: {
            serverContent?: {
              modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
              interrupted?: boolean;
              turnComplete?: boolean;
            };
          }) => {
            const content = message.serverContent;
            if (content?.interrupted) {
              playbackWorkletRef.current?.port.postMessage("interrupt");
              setState("listening");
              return;
            }
            const parts = content?.modelTurn?.parts ?? [];
            let gotAudio = false;
            for (const part of parts) {
              if (part.inlineData?.data) {
                gotAudio = true;
                const float32 = base64ToFloat32(part.inlineData.data);
                playbackWorkletRef.current?.port.postMessage(float32);
              }
            }
            if (gotAudio) setState("speaking");
            if (content?.turnComplete) setState("listening");
          },
          onerror: (event: { message?: string }) => {
            setErrorMessage(event?.message ?? "Voice connection error");
            setState("error");
            teardown();
          },
          onclose: () => {
            setState((current) => (current === "error" ? current : "idle"));
          },
        },
      });
      sessionRef.current = liveSession as unknown as LiveSession;

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = mediaStream;

      const captureContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: CAPTURE_SAMPLE_RATE,
      });
      await captureContext.audioWorklet.addModule("/audio-worklets/capture-processor.js");
      const captureWorklet = new AudioWorkletNode(captureContext, "audio-capture-processor");
      captureWorklet.port.onmessage = (event: MessageEvent<{ type: string; data: Float32Array }>) => {
        if (event.data.type !== "audio" || !sessionRef.current) return;
        const pcm = floatToPCM16(event.data.data);
        const base64 = arrayBufferToBase64(pcm);
        sessionRef.current.sendRealtimeInput({
          audio: { data: base64, mimeType: `audio/pcm;rate=${CAPTURE_SAMPLE_RATE}` },
        });
      };
      const source = captureContext.createMediaStreamSource(mediaStream);
      source.connect(captureWorklet);
      captureContextRef.current = captureContext;
      captureWorkletRef.current = captureWorklet;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not start voice session");
      setState("error");
      teardown();
    }
  }, [actor, state, teardown]);

  return { state, errorMessage, start, stop };
}
