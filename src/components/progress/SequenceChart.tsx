import type { WeightUnit } from '../../domain/types';
import { formatWeight } from '../../domain/units';
import type { SequenceStat } from '../../services/analytics-service';
import { EmptyState } from '../common/EmptyState';

export type SequenceChartProps = {
  stats: SequenceStat[];
  unit: WeightUnit;
};

const VIEW_W = 340;
const VIEW_H = 190;
const PADDING_X = 16;
const PLOT_TOP = 24;
const BASELINE_Y = 130;
const CAPTION_Y1 = 148;
const CAPTION_Y2 = 164;
const MAX_BAR_WIDTH = 40;
const BAR_GAP = 6;
const RADIUS = 4;

// Rounded-top-only bar: two straight sides + square baseline, arced corners
// at the top only, capped so the radius never exceeds half the bar's own
// width or its full height (short bars end up fully rounded, not clipped).
function topRoundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height);
  return `M ${x} ${y + height} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + width - r} ${y} Q ${x + width} ${y} ${x + width} ${y + r} L ${x + width} ${y + height} Z`;
}

export function SequenceChart({ stats, unit }: SequenceChartProps) {
  if (stats.length === 0) {
    return <EmptyState title="No sequence data yet" description="Log this exercise to see position trends." />;
  }

  const plotHeight = BASELINE_Y - PLOT_TOP;
  const maxWeight = Math.max(0, ...stats.map((stat) => stat.avgWeight ?? 0));
  const n = stats.length;
  const available = VIEW_W - 2 * PADDING_X - (n - 1) * BAR_GAP;
  const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(2, available / n));

  const maxIndex = stats.reduce((best, stat, index) => {
    if (stat.avgWeight === undefined) {
      return best;
    }
    if (best === -1 || stat.avgWeight > (stats[best]?.avgWeight ?? 0)) {
      return index;
    }
    return best;
  }, -1);
  const labelAll = n <= 4;

  return (
    <svg
      className="sequence-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`Average weight by set position for this exercise, in ${unit}`}
    >
      <line x1={PADDING_X} y1={BASELINE_Y} x2={VIEW_W - PADDING_X} y2={BASELINE_Y} className="chart-axis" />
      {stats.map((stat, index) => {
        const x = PADDING_X + index * (barWidth + BAR_GAP);
        const height = stat.avgWeight !== undefined && maxWeight > 0 ? (stat.avgWeight / maxWeight) * plotHeight : 0;
        const y = BASELINE_Y - height;
        const showLabel = stat.avgWeight !== undefined && (labelAll || index === maxIndex);

        return (
          <g key={stat.position}>
            <title>
              {`Position ${stat.position} — ${
                stat.avgWeight !== undefined ? `avg ${formatWeight(stat.avgWeight, unit)}` : 'no weight logged'
              } (${stat.count} session${stat.count === 1 ? '' : 's'})`}
            </title>
            <rect x={x} y={PLOT_TOP} width={barWidth} height={BASELINE_Y - PLOT_TOP} fill="transparent" />
            {height > 0 ? (
              <path d={topRoundedRectPath(x, y, barWidth, height, RADIUS)} className="sequence-chart__bar" />
            ) : null}
            {showLabel && stat.avgWeight !== undefined ? (
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="chart-value-label">
                {formatWeight(stat.avgWeight, unit)}
              </text>
            ) : null}
            <text x={x + barWidth / 2} y={CAPTION_Y1} textAnchor="middle" className="chart-caption">
              {stat.position}
            </text>
            <text x={x + barWidth / 2} y={CAPTION_Y2} textAnchor="middle" className="chart-caption-muted">
              ({stat.count})
            </text>
          </g>
        );
      })}
    </svg>
  );
}
