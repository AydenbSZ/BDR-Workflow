"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ConversationMetrics } from "@/components/conversation-metrics";

interface SessionDetail {
  id: string;
  callType?: string;
  persona: string;
  difficulty: string;
  scenario: string;
  score: number | null;
  earnedMeeting: boolean | null;
  scoreBreakdownJson: Record<string, unknown> | null;
  feedbackMarkdown: string | null;
  createdAt: string;
  trainee: { name: string; email: string };
  messages: Array<{ role: string; content: string; createdAt: string }>;
}

const PERSONA_LABELS: Record<string, string> = {
  CHIEF_DEVELOPMENT_OFFICER: "Chief Development Officer",
  DIRECTOR_OF_REAL_ESTATE: "Director of Real Estate",
  DIRECTOR_OF_FRANCHISE_DEVELOPMENT: "Director of Franchise Development",
};

const CALL_TYPE_LABELS: Record<string, string> = {
  COLD_CALL: "Cold Call",
  DISCOVERY: "Discovery Call",
  DEMO: "Demo Call",
};

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    fetch(`/api/practice/${sessionId}`)
      .then((r) => r.json())
      .then(setSession)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function requestScore() {
    setScoring(true);
    try {
      const res = await fetch("/api/practice/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!data.error) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                score: data.score,
                scoreBreakdownJson: data.scoreBreakdown,
                feedbackMarkdown: data.feedback,
                earnedMeeting: data.earnedMeeting,
              }
            : prev
        );
      }
    } finally {
      setScoring(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  if (!session) {
    return <div className="text-center py-12 text-muted-foreground">Session not found</div>;
  }

  const breakdown = session.scoreBreakdownJson as Record<string, unknown> | null;
  const scoreBreakdown = (breakdown?.scoreBreakdown || breakdown) as Record<
    string,
    { score: number; max: number; feedback: string }
  > | null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Session Review</h1>
          <p className="text-muted-foreground mt-1">
            {session.trainee?.name || session.trainee?.email} &middot;{" "}
            {new Date(session.createdAt).toLocaleString()}
          </p>
        </div>
        {session.score != null && (
          <div className="text-center">
            <div className="text-5xl font-bold">{session.score}</div>
            <div className="text-sm text-muted-foreground">/100</div>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline">
          {CALL_TYPE_LABELS[session.callType || "COLD_CALL"]}
        </Badge>
        <Badge variant="outline">{PERSONA_LABELS[session.persona] || session.persona}</Badge>
        <Badge variant="outline">{session.difficulty}</Badge>
        <Badge variant="outline">{session.scenario}</Badge>
        {session.earnedMeeting === true && (
          <Badge className="bg-green-600 text-white">Meeting Earned</Badge>
        )}
        {session.earnedMeeting === false && (
          <Badge variant="secondary">Meeting Not Earned</Badge>
        )}
      </div>

      {session.score == null && (
        <Button onClick={requestScore} disabled={scoring}>
          {scoring && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {scoring ? "Scoring..." : "Score This Session"}
        </Button>
      )}

      {scoreBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle>Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(scoreBreakdown).map(([key, val]) => {
                if (!val || typeof val !== "object" || !("score" in val)) return null;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span>{val.score}/{val.max}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(val.score / val.max) * 100}%` }}
                      />
                    </div>
                    {val.feedback && (
                      <p className="text-xs text-muted-foreground">{val.feedback}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {session.feedbackMarkdown && (
        <Card>
          <CardHeader>
            <CardTitle>Summary Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{session.feedbackMarkdown}</p>
          </CardContent>
        </Card>
      )}

      {session.messages?.length > 0 && (
        <ConversationMetrics
          messages={session.messages}
          callType={session.callType || "COLD_CALL"}
          repRole={session.callType && session.callType !== "COLD_CALL" ? "AE" : "BDR"}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Call Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {session.messages.map((m, i) => (
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
                    {m.role === "TRAINEE"
                      ? `${session.callType && session.callType !== "COLD_CALL" ? "AE" : "BDR"} (Trainee)`
                      : "Prospect (AI)"}
                  </div>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
