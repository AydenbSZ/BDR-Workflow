"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, PhoneOff, Send, Loader2, Star, Mic, MicOff, Volume2, Target, Sparkles } from "lucide-react";
import Link from "next/link";
import { ConversationMetrics } from "@/components/conversation-metrics";
import { useRealtimeCall } from "@/lib/realtime/use-realtime-call";

interface Message {
  role: "TRAINER" | "TRAINEE";
  content: string;
}

interface ScoreData {
  score: number;
  earnedMeeting: boolean;
  scoreBreakdown: Record<string, unknown>;
  feedback: string;
}

interface Recommendation {
  hasHistory: boolean;
  recommendedCallType: string;
  recommendedDifficulty: string;
  recommendedScenario: string;
  weakestSkill?: { key: string; label: string; avg: number } | null;
  topObjection?: { text: string; count: number } | null;
  focusArea?: string;
  message: string;
}

const PERSONAS = [
  { value: "CHIEF_DEVELOPMENT_OFFICER", label: "Chief Development Officer" },
  { value: "DIRECTOR_OF_REAL_ESTATE", label: "Director of Real Estate" },
  { value: "DIRECTOR_OF_FRANCHISE_DEVELOPMENT", label: "Director of Franchise Development" },
];

const DIFFICULTIES = [
  { value: "EASY", label: "Easy", desc: "Receptive prospect, mild objections" },
  { value: "MEDIUM", label: "Medium", desc: "Moderately skeptical, real objections" },
  { value: "HARD", label: "Hard", desc: "Very skeptical, strong pushback" },
];

const CALL_TYPES = [
  {
    value: "COLD_CALL",
    label: "Cold Call",
    role: "BDR",
    desc: "Break through, handle objections, earn the meeting",
  },
  {
    value: "DISCOVERY",
    label: "Discovery Call",
    role: "AE",
    desc: "Ask great questions, uncover pain, qualify, set next steps",
  },
  {
    value: "DEMO",
    label: "Demo Call",
    role: "AE",
    desc: "Tailor the demo, prove value, handle objections, advance the deal",
  },
];

const SCENARIOS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  COLD_CALL: [
    { value: "random", label: "Random" },
    { value: "competitor_in_place", label: "Competitor in Place" },
    { value: "budget_objection", label: "Budget Objection" },
    { value: "ai_skepticism", label: "AI Skepticism" },
    { value: "not_expanding", label: "Not Expanding" },
    { value: "acquisition_growth", label: "Acquisition Growth" },
    { value: "email_me", label: "Email Me" },
  ],
  DISCOVERY: [
    { value: "disco_general", label: "General Discovery" },
    { value: "disco_incumbent", label: "Has Incumbent Tool" },
    { value: "disco_unclear_pain", label: "Unclear Pain / Curious" },
    { value: "disco_multi_stakeholder", label: "Multiple Stakeholders" },
    { value: "disco_aggressive_growth", label: "Aggressive Growth" },
  ],
  DEMO: [
    { value: "demo_general", label: "General Demo" },
    { value: "demo_price_sensitive", label: "Price / ROI Focused" },
    { value: "demo_competitor_compare", label: "Competitor Comparison" },
    { value: "demo_technical_depth", label: "Technical Deep Dive" },
    { value: "demo_skeptical_champion", label: "Skeptical Stakeholder" },
  ],
};

const VOICES: Record<string, string> = {
  CHIEF_DEVELOPMENT_OFFICER: "onyx",
  DIRECTOR_OF_REAL_ESTATE: "echo",
  DIRECTOR_OF_FRANCHISE_DEVELOPMENT: "fable",
};

type Phase = "setup" | "calling" | "scoring" | "results";
type InputMode = "live" | "voice" | "text";

export default function PracticePage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [callType, setCallType] = useState("COLD_CALL");
  const [persona, setPersona] = useState("DIRECTOR_OF_REAL_ESTATE");
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [scenario, setScenario] = useState("random");
  const [companyName, setCompanyName] = useState("");
  const [industryContext, setIndustryContext] = useState("");
  const [gongCallId, setGongCallId] = useState("");
  const [gongCalls, setGongCalls] = useState<{ id: string; title: string | null; callType: string }[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("live");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtime = useRealtimeCall();

  // Mirror the live transcript into the message list so the call + results
  // views render the same way as text/push-to-talk calls.
  useEffect(() => {
    if (inputMode === "live" && realtime.messages.length > 0) {
      setMessages(realtime.messages);
    }
  }, [realtime.messages, inputMode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (phase === "calling") {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const scenarios = SCENARIOS_BY_TYPE[callType] || SCENARIOS_BY_TYPE.COLD_CALL;
  const repRole = CALL_TYPES.find((c) => c.value === callType)?.role || "BDR";

  // Load real Gong calls of the matching type so the prospect can be grounded
  // in an actual deal.
  useEffect(() => {
    if (callType === "COLD_CALL") {
      setGongCalls([]);
      return;
    }
    fetch(`/api/gong/calls?callType=${callType}&limit=50`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.calls)) {
          setGongCalls(
            d.calls.filter((c: { transcriptStatus: string }) => c.transcriptStatus === "AVAILABLE")
          );
        }
      })
      .catch(() => setGongCalls([]));
  }, [callType]);

  function handleCallTypeChange(value: string) {
    setCallType(value);
    setGongCallId("");
    const firstScenario = SCENARIOS_BY_TYPE[value]?.[0]?.value;
    if (firstScenario) setScenario(firstScenario);
  }

  // Fetch the adaptive coaching recommendation once on mount.
  useEffect(() => {
    fetch("/api/practice/recommendation")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setRecommendation(d);
      })
      .catch(() => {});
  }, []);

  function startRecommended(asDrill: boolean) {
    if (!recommendation) return;
    startCall({
      callType: recommendation.recommendedCallType,
      difficulty: recommendation.recommendedDifficulty,
      scenario: recommendation.recommendedScenario,
      focusArea: asDrill ? recommendation.focusArea : undefined,
      isDrill: asDrill,
    });
  }

  const speakText = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);
      const res = await fetch("/api/practice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: VOICES[persona] || "onyx" }),
      });

      if (!res.ok) {
        console.error("TTS error:", await res.json().catch(() => ({})));
        setIsSpeaking(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.play().catch(() => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          resolve();
        });
      });
    } catch (err) {
      console.error("speakText error:", err);
      setIsSpeaking(false);
    }
  }, [persona]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome.");
      setInputMode("text");
      return;
    }

    stopAudio();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          final += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }
      setTranscript(final + interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        console.error("Speech recognition error:", event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript("");
  }, [stopAudio]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  async function startCall(overrides: {
    callType?: string;
    difficulty?: string;
    scenario?: string;
    focusArea?: string;
    isDrill?: boolean;
  } = {}) {
    // Effective config: overrides (e.g. from a recommendation) win over state.
    const eff = {
      callType: overrides.callType ?? callType,
      persona,
      difficulty: overrides.difficulty ?? difficulty,
      scenario: overrides.scenario ?? scenario,
      gongCallId,
    };
    // Reflect overrides in the UI so in-call/results labels are correct.
    if (overrides.callType) setCallType(overrides.callType);
    if (overrides.difficulty) setDifficulty(overrides.difficulty);
    if (overrides.scenario) setScenario(overrides.scenario);

    setLoading(true);
    setCallDuration(0);
    try {
      const isLive = inputMode === "live";
      const res = await fetch("/api/practice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callType: eff.callType,
          persona: eff.persona,
          difficulty: eff.difficulty,
          scenario: eff.scenario,
          companyName: companyName || undefined,
          industryContext: industryContext || undefined,
          gongCallId: eff.gongCallId || undefined,
          focusArea: overrides.focusArea || undefined,
          isDrill: overrides.isDrill || undefined,
          realtime: isLive,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSessionId(data.sessionId);
      setPhase("calling");

      if (isLive) {
        // Live speech-to-speech: the prospect greets over audio.
        setMessages([]);
        await realtime.start(data.sessionId);
      } else {
        setMessages([{ role: "TRAINER", content: data.greeting }]);
        if (inputMode === "voice") {
          await speakText(data.greeting);
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start call");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(overrideContent?: string) {
    const content = overrideContent || input.trim();
    if (!content || loading) return;

    setInput("");
    setTranscript("");
    setMessages((prev) => [...prev, { role: "TRAINEE", content }]);
    setLoading(true);

    try {
      const res = await fetch("/api/practice/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, content }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setMessages((prev) => [...prev, { role: "TRAINER", content: data.content }]);

      if (inputMode === "voice") {
        await speakText(data.content);
      }

      if (data.ended) {
        setPhase("scoring");
        scoreCall();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }

  function sendVoiceMessage() {
    stopListening();
    const text = transcript.trim();
    if (text) {
      sendMessage(text);
    }
  }

  async function endCall() {
    stopListening();
    stopAudio();

    // For live calls, tear down the audio connection and persist the captured
    // transcript before scoring.
    if (inputMode === "live") {
      const finalMessages = realtime.stop();
      setPhase("scoring");
      if (finalMessages.length === 0) {
        alert("No conversation was captured. Try the call again.");
        setPhase("setup");
        return;
      }
      try {
        const res = await fetch("/api/practice/realtime-finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, messages: finalMessages }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to save call");
        setPhase("calling");
        return;
      }
      await scoreCall();
      return;
    }

    setPhase("scoring");
    await scoreCall();
  }

  async function scoreCall() {
    try {
      const res = await fetch("/api/practice/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScoreData(data);
      setPhase("results");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to score call");
      setPhase("calling");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (phase === "setup") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Practice Call</h1>
          <p className="text-muted-foreground mt-1">
            Choose a call type, configure the scenario, and start practicing
          </p>
        </div>

        {recommendation?.hasHistory && (
          <Card className="sz-card border-[#00d4ff]/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#00d4ff]" />
                Recommended for you
              </CardTitle>
              <CardDescription>{recommendation.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {CALL_TYPES.find(
                    (c) => c.value === recommendation.recommendedCallType
                  )?.label || recommendation.recommendedCallType}
                </Badge>
                <Badge variant="outline">
                  {recommendation.recommendedDifficulty}
                </Badge>
                {recommendation.weakestSkill && (
                  <Badge className="bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    Weakest: {recommendation.weakestSkill.label} (
                    {recommendation.weakestSkill.avg}/100)
                  </Badge>
                )}
                {recommendation.topObjection && (
                  <Badge variant="secondary">
                    Struggles with: &ldquo;{recommendation.topObjection.text}&rdquo;
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => startRecommended(true)}
                  disabled={loading}
                  className="sz-gradient-bg text-[#0b1120] font-semibold"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Drill My Weakest Skill
                </Button>
                <Button
                  variant="outline"
                  onClick={() => startRecommended(false)}
                  disabled={loading}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Start Recommended Call
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Call Setup</CardTitle>
            <CardDescription>
              Pick the type of call you want to run and who you are talking to
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Call Type</Label>
              <div className="grid grid-cols-3 gap-3">
                {CALL_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => handleCallTypeChange(ct.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      callType === ct.value
                        ? "border-primary bg-primary/10"
                        : "hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{ct.label}</div>
                      <Badge variant="outline" className="text-[10px]">
                        {ct.role}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {ct.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                {callType === "COLD_CALL"
                  ? "Prospect Title / Persona"
                  : "Prospect You Are Meeting With"}
              </Label>
              <Select value={persona} onValueChange={(v) => v && setPersona(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSONAS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Difficulty</Label>
              <div className="grid grid-cols-3 gap-3">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      difficulty === d.value
                        ? "border-primary bg-primary/10"
                        : "hover:bg-accent"
                    }`}
                  >
                    <div className="font-medium text-sm">{d.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {d.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Scenario</Label>
              <Select value={scenario} onValueChange={(v) => v && setScenario(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name (optional)</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Firehouse Subs"
                />
              </div>
              <div className="space-y-2">
                <Label>Industry (optional)</Label>
                <Input
                  value={industryContext}
                  onChange={(e) => setIndustryContext(e.target.value)}
                  placeholder="e.g., QSR / Fast casual"
                />
              </div>
            </div>

            {callType !== "COLD_CALL" && gongCalls.length > 0 && (
              <div className="space-y-2">
                <Label>Base on a real Gong call (optional)</Label>
                <Select
                  value={gongCallId || "none"}
                  onValueChange={(v) => setGongCallId(!v || v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Generic prospect" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Generic prospect</SelectItem>
                    {gongCalls.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title || "Untitled call"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The AI prospect will adopt the situation, objections, and tone
                  from this real deal.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Input Mode</Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setInputMode("live")}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    inputMode === "live"
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#00e5a0]" />
                    <div className="font-medium text-sm">Live Call</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Real-time phone call. Interrupt each other naturally.
                  </div>
                </button>
                <button
                  onClick={() => setInputMode("voice")}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    inputMode === "voice"
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    <div className="font-medium text-sm">Push-to-Talk</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Speak a turn, then send. Turn-based.
                  </div>
                </button>
                <button
                  onClick={() => setInputMode("text")}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    inputMode === "text"
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    <div className="font-medium text-sm">Text Chat</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Type your responses instead.
                  </div>
                </button>
              </div>
            </div>

            <Button
              onClick={() => startCall()}
              disabled={loading}
              size="lg"
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Phone className="h-4 w-4 mr-2" />
              )}
              {loading
                ? "Connecting..."
                : inputMode === "live"
                ? "Start Live Call"
                : inputMode === "voice"
                ? "Start Voice Call"
                : "Start Text Call"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "results" && scoreData) {
    const breakdown = scoreData.scoreBreakdown as Record<
      string,
      Record<string, { score: number; max: number; feedback: string }>
    >;
    const sb = (breakdown as unknown as Record<string, { score: number; max: number; feedback: string }>) || {};

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Call Results</h1>
            <p className="text-muted-foreground mt-1">
              Here is how you did
            </p>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold">{scoreData.score}</div>
            <div className="text-sm text-muted-foreground">/100</div>
          </div>
        </div>

        <div className="flex gap-3">
          {scoreData.earnedMeeting ? (
            <Badge className="bg-green-600 text-white">Meeting Earned</Badge>
          ) : (
            <Badge variant="secondary">Meeting Not Earned</Badge>
          )}
          <Badge variant="outline">
            {PERSONAS.find((p) => p.value === persona)?.label}
          </Badge>
          <Badge variant="outline">{formatTime(callDuration)}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(sb).map(([key, val]) => {
                if (!val || typeof val !== "object" || !("score" in val)) return null;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span>
                        {val.score}/{val.max}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${(val.score / val.max) * 100}%`,
                        }}
                      />
                    </div>
                    {val.feedback && (
                      <p className="text-xs text-muted-foreground">
                        {val.feedback}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {scoreData.feedback && (
          <Card>
            <CardHeader>
              <CardTitle>Summary Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{scoreData.feedback}</p>
            </CardContent>
          </Card>
        )}

        <ConversationMetrics
          messages={messages}
          callType={callType}
          repRole={repRole}
        />

        <Card>
          <CardHeader>
            <CardTitle>Call Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "TRAINEE" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                      m.role === "TRAINEE"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={() => { setPhase("setup"); setMessages([]); setScoreData(null); setCallDuration(0); }}>
            Practice Again
          </Button>
          <Link href={`/review/${sessionId}`}>
            <Button variant="outline">
              <Star className="h-4 w-4 mr-2" />
              Full Review
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Phone className="h-5 w-5 text-green-500 animate-pulse" />
            {phase === "scoring" ? "Scoring call..." : "Call in Progress"}
            <span className="text-sm font-mono text-muted-foreground ml-2">
              {formatTime(callDuration)}
            </span>
          </h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline">
              {PERSONAS.find((p) => p.value === persona)?.label}
            </Badge>
            <Badge variant="outline">{difficulty}</Badge>
            <Badge variant="outline">
              {CALL_TYPES.find((c) => c.value === callType)?.label}
            </Badge>
            <Badge variant="outline">
              {scenarios.find((s) => s.value === scenario)?.label}
            </Badge>
            <Badge variant={inputMode === "text" ? "outline" : "default"}>
              {inputMode === "live" ? "Live" : inputMode === "voice" ? "Voice" : "Text"}
            </Badge>
          </div>
        </div>
        {phase === "calling" && (
          <Button variant="destructive" onClick={endCall} disabled={loading}>
            <PhoneOff className="h-4 w-4 mr-2" />
            End Call
          </Button>
        )}
      </div>

      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "TRAINEE" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                    m.role === "TRAINEE"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <div className="text-[10px] font-medium opacity-70 mb-1">
                    {m.role === "TRAINEE" ? `You (${repRole})` : "Prospect"}
                  </div>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && phase === "calling" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs text-muted-foreground">Prospect is thinking...</span>
                </div>
              </div>
            )}
            {isSpeaking && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <Volume2 className="h-4 w-4 animate-pulse text-green-500" />
                  <span className="text-xs text-muted-foreground">Prospect is speaking...</span>
                </div>
              </div>
            )}
            {inputMode === "live" && phase === "calling" && realtime.assistantSpeaking && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <Volume2 className="h-4 w-4 animate-pulse text-[#00e5a0]" />
                  <span className="text-xs text-muted-foreground">
                    Prospect is talking — jump in any time
                  </span>
                </div>
              </div>
            )}
            {phase === "scoring" && (
              <div className="flex justify-center py-8">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scoring your call...
                </div>
              </div>
            )}
          </div>
        </div>

        {phase === "calling" && inputMode === "live" && (
          <div className="border-t p-4">
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    realtime.status === "connected"
                      ? "bg-[#00e5a0] animate-pulse"
                      : realtime.status === "connecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-muted-foreground"
                  }`}
                />
                <span className="text-sm text-muted-foreground">
                  {realtime.status === "connecting"
                    ? "Connecting..."
                    : realtime.status === "connected"
                    ? realtime.userSpeaking
                      ? "Listening to you..."
                      : realtime.assistantSpeaking
                      ? "Prospect speaking..."
                      : "Live — just talk"
                    : realtime.status === "error"
                    ? "Connection error"
                    : "Idle"}
                </span>
              </div>
              <Button
                variant={realtime.muted ? "default" : "outline"}
                size="lg"
                onClick={realtime.toggleMute}
                className="h-12"
              >
                {realtime.muted ? (
                  <MicOff className="h-5 w-5 mr-2" />
                ) : (
                  <Mic className="h-5 w-5 mr-2" />
                )}
                {realtime.muted ? "Unmute" : "Mute"}
              </Button>
            </div>
            {realtime.error && (
              <p className="text-xs text-red-400 mt-2 text-center">{realtime.error}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Speak naturally — talk over the prospect to push for the meeting. Click End Call when you&apos;re done.
            </p>
          </div>
        )}

        {phase === "calling" && inputMode === "voice" && (
          <div className="border-t p-4">
            {isListening && transcript && (
              <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Hearing you say:</p>
                <p className="text-sm">{transcript}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              {!isListening ? (
                <Button
                  onClick={startListening}
                  disabled={loading || isSpeaking}
                  size="lg"
                  className="flex-1 h-14"
                >
                  <Mic className="h-5 w-5 mr-2" />
                  {isSpeaking ? "Wait for prospect..." : "Hold to Speak"}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={stopListening}
                    variant="outline"
                    size="lg"
                    className="h-14"
                  >
                    <MicOff className="h-5 w-5 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={sendVoiceMessage}
                    disabled={!transcript.trim()}
                    size="lg"
                    className="flex-1 h-14 bg-green-600 hover:bg-green-700"
                  >
                    <Send className="h-5 w-5 mr-2" />
                    Send
                  </Button>
                </>
              )}
              {isSpeaking && (
                <Button variant="ghost" size="icon" onClick={stopAudio} className="h-14 w-14">
                  <Volume2 className="h-5 w-5" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {isListening
                ? "Speak now. Click Send when done."
                : isSpeaking
                  ? "Prospect is speaking..."
                  : "Click the button and start talking"}
            </p>
          </div>
        )}

        {phase === "calling" && inputMode === "text" && (
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your response..."
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={() => sendMessage()} disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send. The prospect is waiting...
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
