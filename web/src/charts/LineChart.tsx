/**
 * Pure SVG line chart component (no external chart library).
 * Responsive via viewBox.
 */

export interface LinePoint {
  label: string; // e.g. "1", "2", ... "31"
  value: number;
}

interface Props {
  points: LinePoint[];
  /** SVG width (default 600) */
  width?: number;
  /** SVG height (default 220) */
  height?: number;
  /** Optional horizontal reference line (e.g. daily budget) */
  budgetLine?: number | null;
}

function niceMax(raw: number): number {
  if (raw <= 0) return 1000;
  // Round up to next "nice" number for axis
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

export function LineChart({
  points,
  width = 600,
  height = 220,
  budgetLine = null,
}: Props) {
  const pad = { top: 16, right: 16, bottom: 28, left: 72 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  if (points.length === 0) {
    return (
      <div className="agg-line-wrapper">
        <p className="empty-message">データなし</p>
      </div>
    );
  }

  const maxVal = Math.max(
    ...points.map((p) => p.value),
    budgetLine ?? 0,
    1,
  );
  const yMax = niceMax(maxVal);

  // Map data to pixel coords
  const n = points.length;
  const xStep = n > 1 ? plotW / (n - 1) : plotW / 2;

  const toX = (i: number) => pad.left + i * xStep;
  const toY = (v: number) => pad.top + plotH - (v / yMax) * plotH;

  // Polyline points
  const linePoints = points
    .map((p, i) => `${toX(i)},${toY(p.value)}`)
    .join(" ");

  // Area polygon (closed at bottom)
  const areaPoints = [
    `${toX(0)},${toY(0)}`,
    ...points.map((p, i) => `${toX(i)},${toY(p.value)}`),
    `${toX(n - 1)},${toY(0)}`,
  ].join(" ");

  // Y-axis ticks (4 ticks including 0) — ceil to integers
  const yTicks = [0, 1, 2, 3].map((i) => Math.ceil((yMax / 3) * i));

  // X-axis labels: show day 1, every 5 days, and last day
  const xLabels: { index: number; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const day = i + 1;
    if (day === 1 || day === n || day % 5 === 0) {
      xLabels.push({ index: i, label: points[i]!.label });
    }
  }

  const budgetY = budgetLine != null ? toY(budgetLine) : null;

  return (
    <div className="agg-line-wrapper">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        className="agg-line-svg"
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <line
            key={`grid-${i}`}
            x1={pad.left}
            y1={toY(tick)}
            x2={width - pad.right}
            y2={toY(tick)}
            stroke="#e0e0e0"
            strokeWidth={0.5}
          />
        ))}

        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill="#ff9f43"
          fillOpacity={0.15}
        />

        {/* Data line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="#ff9f43"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {points.map((p, i) =>
          p.value > 0 ? (
            <circle
              key={`dot-${i}`}
              cx={toX(i)}
              cy={toY(p.value)}
              r={3}
              fill="#ff9f43"
              stroke="#fff"
              strokeWidth={1}
            >
              <title>
                {p.label}日: ¥{p.value.toLocaleString("ja-JP")}
              </title>
            </circle>
          ) : null,
        )}

        {/* Budget reference line */}
        {budgetY != null && budgetLine != null && budgetLine > 0 && (
          <>
            <line
              x1={pad.left}
              y1={budgetY}
              x2={width - pad.right}
              y2={budgetY}
              stroke="#ff6b6b"
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
            <text
              x={width - pad.right}
              y={budgetY - 4}
              textAnchor="end"
              fontSize={10}
              fill="#ff6b6b"
            >
              日予算 ¥{budgetLine.toLocaleString("ja-JP")}
            </text>
          </>
        )}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <text
            key={`ytick-${i}`}
            x={pad.left - 6}
            y={toY(tick) + 4}
            textAnchor="end"
            fontSize={10}
            fill="#888"
          >
            {tick.toLocaleString("ja-JP")}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ index, label }) => (
          <text
            key={`xtick-${index}`}
            x={toX(index)}
            y={height - pad.bottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill="#888"
          >
            {label}
          </text>
        ))}

        {/* Axes */}
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={height - pad.bottom}
          stroke="#bbb"
          strokeWidth={1}
        />
        <line
          x1={pad.left}
          y1={height - pad.bottom}
          x2={width - pad.right}
          y2={height - pad.bottom}
          stroke="#bbb"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
