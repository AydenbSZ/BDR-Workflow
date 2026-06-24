"use client";

interface Point {
  value: number;
  label?: string;
}

/**
 * Minimal dependency-free line chart for score-over-time. Values are assumed
 * to be on a 0-100 scale.
 */
export function LineChart({
  points,
  height = 160,
  max = 100,
}: {
  points: Point[];
  height?: number;
  max?: number;
}) {
  const width = 600;
  const padX = 28;
  const padY = 16;

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No scored sessions yet — complete a practice call to start tracking
        progress.
      </p>
    );
  }

  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const n = points.length;

  const x = (i: number) => padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padY + innerH - (Math.min(v, max) / max) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  const areaPath =
    `M ${x(0).toFixed(1)} ${(padY + innerH).toFixed(1)} ` +
    points.map((p, i) => `L ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ") +
    ` L ${x(n - 1).toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;

  const gridLines = [0, 25, 50, 75, 100];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ minWidth: 320 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sz-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sz-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#00e5a0" />
          </linearGradient>
        </defs>

        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={padX}
              x2={width - padX}
              y1={y(g)}
              y2={y(g)}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
            <text
              x={padX - 6}
              y={y(g) + 3}
              textAnchor="end"
              fontSize="9"
              fill="currentColor"
              opacity={0.4}
            >
              {g}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#sz-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#sz-line)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={n > 30 ? 1.5 : 3}
            fill="#00e5a0"
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * Horizontal bars for per-dimension averages (0-100).
 */
export function DimensionBars({
  data,
}: {
  data: Record<string, number>;
}) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <div key={key} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium capitalize">
              {key.replace(/([A-Z])/g, " $1").trim()}
            </span>
            <span
              className={
                value >= 70
                  ? "text-[#00e5a0]"
                  : value >= 50
                  ? "text-[#00d4ff]"
                  : "text-amber-400"
              }
            >
              {value}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary">
            <div
              className="h-full rounded-full"
              style={{
                width: `${value}%`,
                background:
                  "linear-gradient(90deg, #00d4ff 0%, #00e5a0 100%)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
