/**
 * Pure SVG pie chart component (no external chart library).
 */

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: PieSlice[];
  /** Diameter in px (default 220) */
  size?: number;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

export function PieChart({ slices, size = 220 }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div className="agg-pie-wrapper">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="agg-pie-svg"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 4}
            fill="#eee"
            stroke="#ddd"
            strokeWidth={1}
          />
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            fill="#999"
          >
            データなし
          </text>
        </svg>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  // Label radius: 62% from center
  const labelR = r * 0.62;
  // Minimum angle (degrees) to show a label inside the slice
  const MIN_LABEL_ANGLE = 18;

  // Single slice → full circle
  if (slices.length === 1) {
    return (
      <div className="agg-pie-wrapper">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="agg-pie-svg"
        >
          <circle cx={cx} cy={cy} r={r} fill={slices[0]!.color} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={13}
            fontWeight="bold"
            fill="#fff"
          >
            100%
          </text>
        </svg>
      </div>
    );
  }

  // Multiple slices
  let cumAngle = 0;
  const elements = slices.map((slice, i) => {
    const sliceAngle = (slice.value / total) * 360;
    const startAngle = cumAngle;
    const endAngle = cumAngle + sliceAngle;
    cumAngle = endAngle;

    // Skip tiny slices (< 0.5 degree) to avoid rendering artifacts
    if (sliceAngle < 0.5) return null;

    const midAngle = startAngle + sliceAngle / 2;
    const labelPos = polarToCartesian(cx, cy, labelR, midAngle);
    const pct = ((slice.value / total) * 100).toFixed(1);
    const showLabel = sliceAngle >= MIN_LABEL_ANGLE;

    return (
      <g key={i}>
        <path
          d={describeArc(cx, cy, r, startAngle, endAngle)}
          fill={slice.color}
          stroke="#fff"
          strokeWidth={1.5}
          className="agg-pie-slice"
        >
          <title>
            {slice.label}: ¥{slice.value.toLocaleString("ja-JP")} ({pct}%)
          </title>
        </path>
        {showLabel && (
          <text
            x={labelPos.x}
            y={labelPos.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight="bold"
            fill="#fff"
            style={{ pointerEvents: "none" }}
          >
            {pct}%
          </text>
        )}
      </g>
    );
  });

  return (
    <div className="agg-pie-wrapper">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="agg-pie-svg"
      >
        {elements}
      </svg>
    </div>
  );
}
