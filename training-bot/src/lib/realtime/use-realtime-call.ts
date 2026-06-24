"use client";

import { useCallback, useRef, useState } from "react";

export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "ended"
  | "error";

export interface RealtimeMessage {
  role: "TRAINEE" | "TRAINER";
  content: string;
}

interface RealtimeEvent {
  type: string;
  transcript?: string;
  [key: string]: unknown;
}

/**
 * Manages a live speech-to-speech call with the OpenAI Realtime API over
 * WebRTC. Server VAD handles turn-taking and barge-in automatically, so the
 * trainee and the AI prospect can talk over each other naturally.
 */
export function useRealtimeCall() {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesRef = useRef<RealtimeMessage[]>([]);

  const pushMessage = useCallback((msg: RealtimeMessage) => {
    if (!msg.content.trim()) return;
    messagesRef.current = [...messagesRef.current, msg];
    setMessages(messagesRef.current);
  }, []);

  const handleEvent = useCallback(
    (evt: RealtimeEvent) => {
      switch (evt.type) {
        case "input_audio_buffer.speech_started":
          setUserSpeaking(true);
          // The trainee barging in interrupts the prospect.
          setAssistantSpeaking(false);
          break;
        case "input_audio_buffer.speech_stopped":
          setUserSpeaking(false);
          break;
        case "conversation.item.input_audio_transcription.completed":
          if (evt.transcript) pushMessage({ role: "TRAINEE", content: evt.transcript });
          break;
        // GA renamed this from "response.audio_transcript.done".
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done":
          if (evt.transcript) pushMessage({ role: "TRAINER", content: evt.transcript });
          break;
        case "output_audio_buffer.started":
          setAssistantSpeaking(true);
          break;
        case "output_audio_buffer.stopped":
        case "response.done":
          setAssistantSpeaking(false);
          break;
        case "error":
          console.error("Realtime error event:", evt);
          break;
      }
    },
    [pushMessage]
  );

  const stop = useCallback((): RealtimeMessage[] => {
    try {
      dcRef.current?.close();
    } catch {
      /* noop */
    }
    try {
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
    } catch {
      /* noop */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    pcRef.current = null;
    dcRef.current = null;
    streamRef.current = null;
    setUserSpeaking(false);
    setAssistantSpeaking(false);
    setStatus("ended");
    return messagesRef.current;
  }, []);

  const start = useCallback(
    async (sessionId: string) => {
      setError(null);
      setStatus("connecting");
      messagesRef.current = [];
      setMessages([]);
      try {
        // 1) Mint an ephemeral token (instructions live server-side).
        const tokenRes = await fetch("/api/practice/realtime-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) {
          throw new Error(tokenData.error || "Failed to start realtime session");
        }
        const { token, model } = tokenData as { token: string; model: string };

        // 2) Microphone.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // 3) Peer connection + remote audio playback.
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        const audioEl = new Audio();
        audioEl.autoplay = true;
        audioRef.current = audioEl;
        pc.ontrack = (e) => {
          audioEl.srcObject = e.streams[0];
        };

        pc.addTrack(stream.getTracks()[0], stream);

        // 4) Data channel for events.
        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;
        dc.onmessage = (e) => {
          try {
            handleEvent(JSON.parse(e.data));
          } catch {
            /* ignore malformed */
          }
        };
        dc.onopen = () => {
          // Prompt the prospect to answer the phone first.
          dc.send(JSON.stringify({ type: "response.create" }));
        };

        // 5) SDP offer/answer with OpenAI.
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpRes = await fetch(
          `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
          {
            method: "POST",
            body: offer.sdp,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/sdp",
            },
          }
        );
        if (!sdpRes.ok) {
          throw new Error(`Realtime connect failed (${sdpRes.status})`);
        }
        const answerSdp = await sdpRes.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        pc.onconnectionstatechange = () => {
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setStatus((s) => (s === "ended" ? s : "error"));
          }
        };

        setStatus("connected");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
        setStatus("error");
        stop();
      }
    },
    [handleEvent, stop]
  );

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMuted(!track.enabled);
    }
  }, []);

  return {
    status,
    messages,
    error,
    userSpeaking,
    assistantSpeaking,
    muted,
    start,
    stop,
    toggleMute,
  };
}
