"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeConversationMetrics,
  assessMetrics,
  type ConversationMessage,
  type MetricAssessment,
} from "@/lib/analytics/conversation";
import { MessageCircleQuestion, Mic, Gauge, Sparkles } from "lucide-react";

const LABEL_STYLES: Record<MetricAssessment["label"], string> = {
  great: "text-[#00e5a0]",
  good: "text-[#00d4ff]",
  watch: "text-amber-400",
};

const DOT_STYLES: Record<MetricAssessment["label"], string> = {
  great: "bg-[#00e5a0]",
  good: "bg-[#00d4ff]",
  watch: "bg-amber-400",
};

export function ConversationMetrics({
  messages,
  callType = "COLD_CALL",
  repRole = "Rep",
}: {
  messages: ConversationMessage[];
  callType?: string;
  repRole?: string;
}) {
  const metrics = computeConversationMetrics(messages);
  if (metrics.totalWords === 0) return null;
  const assess = assessMetrics(metrics, callType);

  const prospectRatio = 100 - metrics.talkRatio;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-[#00d4ff]" />
          Conversation Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Talk ratio bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{repRole}: {metrics.talkRatio}%</span>
            <span>Prospect: {prospectRatio}%</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            <div
              className="bg-[#00d4ff] transition-all"
              style={{ width: `${metrics.talkRatio}%` }}
            />
            <div
              className="bg-[#1e293b] transition-all"
              style={{ width: `${prospectRatio}%` }}
            />
          </div>
          <Assessment a={assess.talkRatio} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            icon={<Mic className="h-4 w-4" />}
            value={`${metrics.repWords}`}
            label="words spoken"
          />
          <Stat
            icon={<MessageCircleQuestion className="h-4 w-4" />}
            value={`${metrics.questionsAsked}`}
            label="questions asked"
          />
          <Stat
            icon={<Sparkles className="h-4 w-4" />}
            value={`${metrics.avgRepTurnWords}`}
            label="avg words/turn"
          />
          <Stat
            icon={<Gauge className="h-4 w-4" />}
            value={`${metrics.fillerCount}`}
            label="filler words"
          />
        </div>

        <div className="space-y-2 border-t pt-4">
          <Assessment a={assess.questions} />
          <Assessment a={assess.monologue} />
          <Assessment a={assess.filler} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Assessment({ a }: { a: MetricAssessment }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span
        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT_STYLES[a.label]}`}
      />
      <span className={LABEL_STYLES[a.label]}>{a.note}</span>
    </div>
  );
}
