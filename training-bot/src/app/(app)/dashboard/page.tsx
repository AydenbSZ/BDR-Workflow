"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, BookOpen, TrendingUp, Users, FileText, Database } from "lucide-react";
import { LineChart, DimensionBars } from "@/components/progress-chart";

const CALL_TYPE_LABELS: Record<string, string> = {
  COLD_CALL: "Cold Call",
  DISCOVERY: "Discovery",
  DEMO: "Demo",
};

interface DashboardData {
  role: string;
  totalCalls?: number;
  approvedDocs?: number;
  totalTrainees?: number;
  recentSessions?: Array<{
    id: string;
    callType?: string;
    persona: string;
    difficulty: string;
    scenario: string;
    score: number | null;
    earnedMeeting: boolean | null;
    createdAt: string;
    trainee?: { name: string; email: string };
  }>;
  avgScore?: number | null;
  totalSessions?: number;
  lastSync?: { createdAt: string; status: string } | null;
  avgByPersona?: Record<string, number>;
  avgByTrainee?: Record<string, { name: string; avg: number; count: number }>;
  progression?: Array<{ date: string; score: number | null; callType: string }>;
  dimensionAverages?: Record<string, number>;
  byCallType?: Record<string, { count: number; avg: number; earned: number }>;
  teamProgression?: Array<{ week: string; avg: number; count: number }>;
}

const PERSONA_LABELS: Record<string, string> = {
  CHIEF_DEVELOPMENT_OFFICER: "CDO",
  DIRECTOR_OF_REAL_ESTATE: "Dir. Real Estate",
  DIRECTOR_OF_FRANCHISE_DEVELOPMENT: "Dir. Franchise Dev",
  OTHER: "Other",
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ctFilter, setCtFilter] = useState<string>("ALL");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  const isTrainee = data?.role === "TRAINEE";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isTrainee
            ? "Practice your cold calls and track your progress"
            : "Overview of your BDR training program"}
        </p>
      </div>

      {isTrainee ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Sessions</CardDescription>
                <CardTitle className="text-3xl">{data?.totalSessions || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Average Score</CardDescription>
                <CardTitle className="text-3xl">
                  {data?.avgScore != null ? `${data.avgScore}/100` : "N/A"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Quick Actions</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/practice">
                  <Button className="w-full">
                    <Phone className="h-4 w-4 mr-2" />
                    Start Practice Call
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {(() => {
            const prog = data?.progression || [];
            const filtered =
              ctFilter === "ALL"
                ? prog
                : prog.filter((p) => p.callType === ctFilter);
            const points = filtered
              .filter((p) => p.score != null)
              .map((p) => ({ value: p.score as number }));
            const types = Object.keys(data?.byCallType || {});
            return (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-[#00d4ff]" />
                        Progress Over Time
                      </CardTitle>
                      <CardDescription>
                        Your practice score across sessions
                      </CardDescription>
                    </div>
                    {types.length > 1 && (
                      <div className="flex gap-1.5">
                        {["ALL", ...types].map((t) => (
                          <Button
                            key={t}
                            variant={ctFilter === t ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCtFilter(t)}
                          >
                            {t === "ALL" ? "All" : CALL_TYPE_LABELS[t] || t}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <LineChart points={points} />
                </CardContent>
              </Card>
            );
          })()}

          {data?.byCallType && Object.keys(data.byCallType).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(data.byCallType).map(([ct, v]) => (
                <Card key={ct}>
                  <CardHeader className="pb-2">
                    <CardDescription>
                      {CALL_TYPE_LABELS[ct] || ct}
                    </CardDescription>
                    <CardTitle className="text-2xl">
                      {v.avg}
                      <span className="text-sm text-muted-foreground font-normal">
                        {" "}
                        avg
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{v.count} sessions</span>
                      <span>{v.earned}% earned next step</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {data?.dimensionAverages &&
            Object.keys(data.dimensionAverages).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Skills Breakdown</CardTitle>
                  <CardDescription>
                    Average score by dimension across all your sessions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DimensionBars data={data.dimensionAverages} />
                </CardContent>
              </Card>
            )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.recentSessions?.length ? (
                <div className="space-y-3">
                  {data.recentSessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/review/${s.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">
                          {CALL_TYPE_LABELS[s.callType || "COLD_CALL"]}
                        </Badge>
                        <Badge variant="outline">
                          {PERSONA_LABELS[s.persona] || s.persona}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {s.difficulty} / {s.scenario}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {s.score != null && (
                          <Badge variant={s.score >= 70 ? "default" : "secondary"}>
                            {s.score}/100
                          </Badge>
                        )}
                        {s.earnedMeeting && (
                          <Badge className="bg-green-600">Meeting Booked</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No practice sessions yet. Start your first call!
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Database className="h-4 w-4" /> Imported Calls
                </CardDescription>
                <CardTitle className="text-3xl">{data?.totalCalls || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Training Docs
                </CardDescription>
                <CardTitle className="text-3xl">{data?.approvedDocs || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> Trainees
                </CardDescription>
                <CardTitle className="text-3xl">{data?.totalTrainees || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Last Sync
                </CardDescription>
                <CardTitle className="text-lg">
                  {data?.lastSync
                    ? new Date(data.lastSync.createdAt).toLocaleDateString()
                    : "Never"}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {data?.teamProgression && data.teamProgression.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[#00d4ff]" />
                  Team Score Trend
                </CardTitle>
                <CardDescription>Weekly average across all reps</CardDescription>
              </CardHeader>
              <CardContent>
                <LineChart
                  points={data.teamProgression.map((w) => ({ value: w.avg }))}
                />
              </CardContent>
            </Card>
          )}

          {data?.byCallType && Object.keys(data.byCallType).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(data.byCallType).map(([ct, v]) => (
                <Card key={ct}>
                  <CardHeader className="pb-2">
                    <CardDescription>
                      {CALL_TYPE_LABELS[ct] || ct}
                    </CardDescription>
                    <CardTitle className="text-2xl">
                      {v.avg}
                      <span className="text-sm text-muted-foreground font-normal">
                        {" "}
                        avg
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{v.count} sessions</span>
                      <span>{v.earned}% earned</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {data?.dimensionAverages &&
            Object.keys(data.dimensionAverages).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Team Skills Breakdown</CardTitle>
                  <CardDescription>
                    Average score by dimension across all sessions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DimensionBars data={data.dimensionAverages} />
                </CardContent>
              </Card>
            )}

          {data?.avgByPersona && Object.keys(data.avgByPersona).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Average Score by Persona</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(data.avgByPersona).map(([persona, avg]) => (
                    <div key={persona} className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="text-sm font-medium">
                        {PERSONA_LABELS[persona] || persona}
                      </span>
                      <Badge variant={avg >= 70 ? "default" : "secondary"}>
                        {avg}/100
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Practice Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.recentSessions?.length ? (
                <div className="space-y-3">
                  {data.recentSessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/review/${s.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                          {s.trainee?.name || s.trainee?.email || "Unknown"}
                        </span>
                        <Badge variant="outline">
                          {PERSONA_LABELS[s.persona] || s.persona}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        {s.score != null && (
                          <Badge variant={s.score >= 70 ? "default" : "secondary"}>
                            {s.score}/100
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No practice sessions yet.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Link href="/practice">
              <Button>
                <Phone className="h-4 w-4 mr-2" />
                Start Practice Call
              </Button>
            </Link>
            <Link href="/hubspot">
              <Button variant="outline">
                <Database className="h-4 w-4 mr-2" />
                HubSpot Sync
              </Button>
            </Link>
            <Link href="/library">
              <Button variant="outline">
                <BookOpen className="h-4 w-4 mr-2" />
                Training Library
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
