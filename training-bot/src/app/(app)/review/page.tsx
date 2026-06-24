"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Session {
  id: string;
  persona: string;
  difficulty: string;
  scenario: string;
  score: number | null;
  earnedMeeting: boolean | null;
  createdAt: string;
  trainee: { id: string; name: string; email: string };
  _count: { messages: number };
}

const PERSONA_LABELS: Record<string, string> = {
  CHIEF_DEVELOPMENT_OFFICER: "Chief Development Officer",
  DIRECTOR_OF_REAL_ESTATE: "Director of Real Estate",
  DIRECTOR_OF_FRANCHISE_DEVELOPMENT: "Director of Franchise Development",
};

export default function ReviewPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/practice/sessions?limit=50")
      .then((r) => r.json())
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Call Review</h1>
        <p className="text-muted-foreground mt-1">
          Review past practice sessions and scores
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No practice sessions yet. Start a practice call to see results here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Link key={s.id} href={`/review/${s.id}`}>
              <Card className="hover:bg-accent transition-colors cursor-pointer">
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">
                        {s.trainee?.name || s.trainee?.email}
                      </CardTitle>
                      <Badge variant="outline">
                        {PERSONA_LABELS[s.persona] || s.persona}
                      </Badge>
                      <Badge variant="outline">{s.difficulty}</Badge>
                      <Badge variant="outline">{s.scenario}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {s._count.messages} messages
                      </span>
                      {s.score != null ? (
                        <Badge variant={s.score >= 70 ? "default" : "secondary"}>
                          {s.score}/100
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Unscored</Badge>
                      )}
                      {s.earnedMeeting && (
                        <Badge className="bg-green-600 text-white">Meeting</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
