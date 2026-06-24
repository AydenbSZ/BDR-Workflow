import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

interface ScoredRow {
  score: number | null;
  callType: string;
  earnedMeeting: boolean | null;
  createdAt: Date;
  scoreBreakdownJson: unknown;
}

interface BreakdownDim {
  score?: number;
  max?: number;
}

// Aggregate per-dimension averages (as percentages) across scored sessions.
function dimensionAverages(rows: ScoredRow[]): Record<string, number> {
  const totals: Record<string, { sum: number; count: number }> = {};
  for (const r of rows) {
    const bd = r.scoreBreakdownJson as { scoreBreakdown?: Record<string, BreakdownDim> } | null;
    const dims = bd?.scoreBreakdown;
    if (!dims) continue;
    for (const [key, val] of Object.entries(dims)) {
      if (!val || typeof val !== "object" || typeof val.score !== "number") continue;
      const max = typeof val.max === "number" && val.max > 0 ? val.max : 100;
      if (!totals[key]) totals[key] = { sum: 0, count: 0 };
      totals[key].sum += (val.score / max) * 100;
      totals[key].count += 1;
    }
  }
  return Object.fromEntries(
    Object.entries(totals).map(([k, v]) => [k, Math.round(v.sum / v.count)])
  );
}

function byCallType(rows: ScoredRow[]) {
  const out: Record<string, { count: number; avg: number; earned: number }> = {};
  const acc: Record<string, { sum: number; count: number; earned: number }> = {};
  for (const r of rows) {
    const ct = r.callType || "COLD_CALL";
    if (!acc[ct]) acc[ct] = { sum: 0, count: 0, earned: 0 };
    acc[ct].sum += r.score || 0;
    acc[ct].count += 1;
    if (r.earnedMeeting) acc[ct].earned += 1;
  }
  for (const [ct, v] of Object.entries(acc)) {
    out[ct] = {
      count: v.count,
      avg: Math.round(v.sum / v.count),
      earned: v.count > 0 ? Math.round((v.earned / v.count) * 100) : 0,
    };
  }
  return out;
}

export async function GET() {
  try {
    const session = await requireAuth();
    const role = (session.user as { role: string }).role;

    if (role === "TRAINEE") {
      const recentSessions = await db.practiceSession.findMany({
        where: { traineeId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          callType: true,
          persona: true,
          difficulty: true,
          scenario: true,
          score: true,
          earnedMeeting: true,
          createdAt: true,
        },
      });

      const allScored = (await db.practiceSession.findMany({
        where: { traineeId: session.user.id, score: { not: null } },
        orderBy: { createdAt: "asc" },
        select: {
          score: true,
          callType: true,
          earnedMeeting: true,
          createdAt: true,
          scoreBreakdownJson: true,
        },
      })) as ScoredRow[];

      const avgScore =
        allScored.length > 0
          ? Math.round(
              allScored.reduce((sum, s) => sum + (s.score || 0), 0) /
                allScored.length
            )
          : null;

      const progression = allScored.map((s) => ({
        date: s.createdAt,
        score: s.score,
        callType: s.callType || "COLD_CALL",
      }));

      return NextResponse.json({
        role: "TRAINEE",
        recentSessions,
        totalSessions: allScored.length,
        avgScore,
        progression,
        dimensionAverages: dimensionAverages(allScored),
        byCallType: byCallType(allScored),
      });
    }

    const [totalCalls, approvedDocs, totalTrainees, recentSessions, lastSync] =
      await Promise.all([
        db.hubSpotCall.count(),
        db.knowledgeDocument.count({ where: { approved: true } }),
        db.user.count({ where: { role: "TRAINEE" } }),
        db.practiceSession.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { trainee: { select: { name: true, email: true } } },
        }),
        db.syncLog.findFirst({ orderBy: { createdAt: "desc" } }),
      ]);

    const scoredSessions = (await db.practiceSession.findMany({
      where: { score: { not: null } },
      orderBy: { createdAt: "asc" },
      select: {
        score: true,
        callType: true,
        persona: true,
        earnedMeeting: true,
        createdAt: true,
        traineeId: true,
        scoreBreakdownJson: true,
        trainee: { select: { name: true } },
      },
    })) as (ScoredRow & { persona: string; traineeId: string; trainee: { name: string | null } | null })[];

    const avgByPersona: Record<string, { total: number; count: number }> = {};
    const avgByTrainee: Record<
      string,
      { name: string; total: number; count: number }
    > = {};

    for (const s of scoredSessions) {
      if (!avgByPersona[s.persona]) avgByPersona[s.persona] = { total: 0, count: 0 };
      avgByPersona[s.persona].total += s.score || 0;
      avgByPersona[s.persona].count++;

      if (!avgByTrainee[s.traineeId]) {
        avgByTrainee[s.traineeId] = {
          name: s.trainee?.name || "Unknown",
          total: 0,
          count: 0,
        };
      }
      avgByTrainee[s.traineeId].total += s.score || 0;
      avgByTrainee[s.traineeId].count++;
    }

    // Weekly team average for the trend line.
    const weekly: Record<string, { sum: number; count: number }> = {};
    for (const s of scoredSessions) {
      const d = new Date(s.createdAt);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      if (!weekly[key]) weekly[key] = { sum: 0, count: 0 };
      weekly[key].sum += s.score || 0;
      weekly[key].count += 1;
    }
    const teamProgression = Object.entries(weekly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ week, avg: Math.round(v.sum / v.count), count: v.count }));

    return NextResponse.json({
      role: "ADMIN",
      totalCalls,
      approvedDocs,
      totalTrainees,
      recentSessions,
      lastSync,
      avgByPersona: Object.fromEntries(
        Object.entries(avgByPersona).map(([k, v]) => [
          k,
          Math.round(v.total / v.count),
        ])
      ),
      avgByTrainee: Object.fromEntries(
        Object.entries(avgByTrainee).map(([k, v]) => [
          k,
          { name: v.name, avg: Math.round(v.total / v.count), count: v.count },
        ])
      ),
      byCallType: byCallType(scoredSessions),
      dimensionAverages: dimensionAverages(scoredSessions),
      teamProgression,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
