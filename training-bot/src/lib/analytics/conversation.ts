// Pure conversation analytics — safe to import on both server and client.
// Computes talk ratio, turn stats, question count, filler usage, and longest
// monologue from a practice transcript.

export interface ConversationMessage {
  role: string; // "TRAINEE" | "TRAINER" (prospect) | "SYSTEM"
  content: string;
}

export interface ConversationMetrics {
  repWords: number;
  prospectWords: number;
  totalWords: number;
  /** Rep share of total spoken words, 0-100. */
  talkRatio: number;
  repTurns: number;
  prospectTurns: number;
  avgRepTurnWords: number;
  longestRepMonologueWords: number;
  questionsAsked: number;
  fillerCount: number;
  /** Filler words per 100 rep words. */
  fillerRate: number;
}

const FILLER_PATTERNS: RegExp[] = [
  /\bum+\b/gi,
  /\buh+\b/gi,
  /\ber+\b/gi,
  /\blike\b/gi,
  /\byou know\b/gi,
  /\bi mean\b/gi,
  /\bbasically\b/gi,
  /\bactually\b/gi,
  /\bliterally\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\bkinda\b/gi,
  /\bsorta\b/gi,
  /\bso yeah\b/gi,
];

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function countQuestions(text: string): number {
  // Count sentences ending in "?" plus interrogative openers without a mark.
  const marks = (text.match(/\?/g) || []).length;
  return marks;
}

function countFillers(text: string): number {
  let n = 0;
  for (const pattern of FILLER_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) n += matches.length;
  }
  return n;
}

/**
 * Compute conversation metrics. The trainee is whoever has role "TRAINEE";
 * everyone else (the AI prospect) counts as the prospect side.
 */
export function computeConversationMetrics(
  messages: ConversationMessage[]
): ConversationMetrics {
  let repWords = 0;
  let prospectWords = 0;
  let repTurns = 0;
  let prospectTurns = 0;
  let questionsAsked = 0;
  let fillerCount = 0;
  let longestRepMonologueWords = 0;

  for (const m of messages) {
    if (m.role === "SYSTEM") continue;
    const words = countWords(m.content);
    if (m.role === "TRAINEE") {
      repWords += words;
      repTurns += 1;
      questionsAsked += countQuestions(m.content);
      fillerCount += countFillers(m.content);
      if (words > longestRepMonologueWords) longestRepMonologueWords = words;
    } else {
      prospectWords += words;
      prospectTurns += 1;
    }
  }

  const totalWords = repWords + prospectWords;
  const talkRatio = totalWords > 0 ? Math.round((repWords / totalWords) * 100) : 0;
  const avgRepTurnWords = repTurns > 0 ? Math.round(repWords / repTurns) : 0;
  const fillerRate =
    repWords > 0 ? Math.round((fillerCount / repWords) * 1000) / 10 : 0;

  return {
    repWords,
    prospectWords,
    totalWords,
    talkRatio,
    repTurns,
    prospectTurns,
    avgRepTurnWords,
    longestRepMonologueWords,
    questionsAsked,
    fillerCount,
    fillerRate,
  };
}

export interface MetricAssessment {
  label: "great" | "good" | "watch";
  note: string;
}

/**
 * Convert raw metrics into coaching-friendly assessments. Ideal talk ratio
 * differs by call type: cold calls reward concision, discovery rewards
 * listening, demos sit in between.
 */
export function assessMetrics(
  m: ConversationMetrics,
  callType: string = "COLD_CALL"
): {
  talkRatio: MetricAssessment;
  questions: MetricAssessment;
  monologue: MetricAssessment;
  filler: MetricAssessment;
} {
  // Target rep talk ratio band per call type.
  const band =
    callType === "DISCOVERY"
      ? { low: 30, high: 45 }
      : callType === "DEMO"
      ? { low: 45, high: 65 }
      : { low: 40, high: 60 }; // cold call

  const talkRatio: MetricAssessment =
    m.talkRatio > band.high
      ? {
          label: "watch",
          note: `You spoke ${m.talkRatio}% of the time — let the prospect talk more.`,
        }
      : m.talkRatio < band.low
      ? {
          label: "good",
          note: `You spoke ${m.talkRatio}% of the time — prospect-led, just make sure you drove the agenda.`,
        }
      : {
          label: "great",
          note: `${m.talkRatio}% talk time is right in the ideal range for this call type.`,
        };

  const questionTarget = callType === "DISCOVERY" ? 8 : callType === "DEMO" ? 5 : 3;
  const questions: MetricAssessment =
    m.questionsAsked >= questionTarget
      ? { label: "great", note: `Asked ${m.questionsAsked} questions — strong curiosity.` }
      : m.questionsAsked >= Math.ceil(questionTarget / 2)
      ? { label: "good", note: `Asked ${m.questionsAsked} questions — try to dig a little deeper.` }
      : { label: "watch", note: `Only ${m.questionsAsked} questions — ask more to uncover needs.` };

  const monologue: MetricAssessment =
    m.longestRepMonologueWords > 130
      ? {
          label: "watch",
          note: `Longest stretch was ${m.longestRepMonologueWords} words — tighten it up and check for reactions.`,
        }
      : m.longestRepMonologueWords > 80
      ? { label: "good", note: `Longest stretch ${m.longestRepMonologueWords} words — mostly concise.` }
      : { label: "great", note: `Tight responses (longest ${m.longestRepMonologueWords} words).` };

  const filler: MetricAssessment =
    m.fillerRate > 4
      ? {
          label: "watch",
          note: `${m.fillerCount} filler words (${m.fillerRate}/100 words) — slow down and pause instead.`,
        }
      : m.fillerRate > 2
      ? { label: "good", note: `${m.fillerCount} filler words — fairly clean delivery.` }
      : { label: "great", note: `Clean delivery — only ${m.fillerCount} filler words.` };

  return { talkRatio, questions, monologue, filler };
}
