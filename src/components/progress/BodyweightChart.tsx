import type { WeightUnit } from '../../domain/types';
import { formatWeight } from '../../domain/units';
import { EmptyState } from '../common/EmptyState';

export type BodyweightChartProps = {
  points: { date: string; value: number }[];
  unit: WeightUnit;
};

const VIEW_W = 340;
const VIEW_H = 180;
const PADDING_X = 16;
const PLOT_TOP = 28;
const PLOT_BOTTOM = 140;
const BASELINE_Y = PLOT_BOTTOM;

function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day as number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function BodyweightChart({ points, unit }: BodyweightChartProps) {
  if (points.length === 0) {
    return <EmptyState title="No bodyweight entries yet" description="Log your bodyweight to see the trend." />;
  }

  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin;
  const minVal = span === 0 ? rawMin - 1 : rawMin;
  const maxVal = span === 0 ? rawMax + 1 : rawMax;

  const n = points.length;
  const plotWidth = VIEW_W - 2 * PADDING_X;

  const coords = points.map((point, index) => {
    const x = n === 1 ? PADDING_X + plotWidth / 2 : PADDING_X + (index / (n - 1)) * plotWidth;
    const y = PLOT_BOTTOM - ((point.value - minVal) / (maxVal - minVal)) * (PLOT_BOTTOM - PLOT_TOP);
    return { x, y };
  });

  const minIndex = values.indexOf(rawMin);
  const maxIndex = values.indexOf(rawMax);
  const lastIndex = coords.length - 1;
  const last = coords[lastIndex]!;
  const lastPoint = points[lastIndex]!;

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <svg
      className="bodyweight-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`Bodyweight trend in ${unit}, from ${formatShortDate(points[0]!.date)} to ${formatShortDate(lastPoint.date)}`}
    >
      <line x1={PADDING_X} y1={BASELINE_Y} x2={VIEW_W - PADDING_X} y2={BASELINE_Y} className="chart-axis" />
      <polyline points={polylinePoints} className="bodyweight-chart__line" fill="none" />

      {coords.map((c, index) => (
        <circle key={points[index]!.date + index} cx={c.x} cy={c.y} r={6} fill="transparent" pointerEvents="all">
          <title>{`${formatShortDate(points[index]!.date)} — ${formatWeight(points[index]!.value, unit)}`}</title>
        </circle>
      ))}

      {minIndex !== maxIndex ? (
        <text x={coords[minIndex]!.x} y={coords[minIndex]!.y + 14} textAnchor="middle" className="chart-caption">
          min {formatWeight(rawMin, unit)}
        </text>
      ) : null}
      <text x={coords[maxIndex]!.x} y={coords[maxIndex]!.y - 8} textAnchor="middle" className="chart-caption">
        max {formatWeight(rawMax, unit)}
      </text>

      <circle cx={last.x} cy={last.y} r={4} className="bodyweight-chart__marker" />
      <text x={last.x} y={last.y - 14} textAnchor="end" className="bodyweight-chart__last-value">
        {formatWeight(lastPoint.value, unit)}
      </text>
    </svg>
  );
}
