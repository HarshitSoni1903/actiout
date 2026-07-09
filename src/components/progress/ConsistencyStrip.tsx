import { localDateDaysAgo, weekdayOf } from '../../utils/dates';
import { EmptyState } from '../common/EmptyState';

export type ConsistencyStripProps = {
  byDate: { date: string; completed: number }[];
};

const WINDOW_DAYS = 84;
const COLUMNS = 12;
const ROWS = 7;
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const VIEW_W = 340;
const VIEW_H = 220;
// GRID_LEFT leaves room for the single-letter weekday row labels (drawn
// anchor-end at GRID_LEFT - 10) so they don't clip against the SVG's left
// edge; the dot grid itself starts at GRID_LEFT, symmetric with the right
// margin below.
const GRID_LEFT = 26;
const GRID_TOP = 8;
const DOT_R = 6;
const DOT_GAP_X = (VIEW_W - 2 * GRID_LEFT) / COLUMNS;
const DOT_GAP_Y = 20;

const BARS_TOP = 170;
const BAR_MAX_HEIGHT = 32;
const BAR_WIDTH = 16;
const BAR_GAP = 8;

export function ConsistencyStrip({ byDate }: ConsistencyStripProps) {
  if (byDate.length === 0) {
    return <EmptyState title="No sessions logged yet" description="Complete a workout to build your streak." />;
  }

  const completedByDate = new Map(byDate.map((entry) => [entry.date, entry.completed]));

  // Chunking 84 consecutive days into 12 groups of 7, in chronological order,
  // yields a valid 7-row (weekday) grid regardless of which weekday the
  // window happens to start on — every 7-day chunk contains each weekday
  // exactly once.
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => localDateDaysAgo(WINDOW_DAYS - 1 - i));

  // Deliberately derived here from `byDate` rather than consuming the
  // service's own `getConsistency().byWeekday` (this component only takes
  // `byDate`, per its prop contract). Equivalent as long as the caller
  // queries the service with `days === WINDOW_DAYS` (84) — both sum
  // completed-session counts over the identical last-84-day window grouped
  // by weekday.
  const byWeekday = new Array<number>(ROWS).fill(0);
  for (const date of days) {
    const weekday = weekdayOf(date);
    byWeekday[weekday] = (byWeekday[weekday] ?? 0) + (completedByDate.get(date) ?? 0);
  }
  const maxWeekday = Math.max(1, ...byWeekday);

  return (
    <svg
      className="consistency-strip"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label="Workout consistency over the last 12 weeks"
    >
      {days.map((date, index) => {
        const column = Math.floor(index / ROWS);
        const row = weekdayOf(date);
        const completed = completedByDate.get(date) ?? 0;
        const cx = GRID_LEFT + column * DOT_GAP_X + DOT_GAP_X / 2;
        const cy = GRID_TOP + row * DOT_GAP_Y + DOT_GAP_Y / 2;

        return (
          <circle
            key={date}
            cx={cx}
            cy={cy}
            r={DOT_R}
            className={
              completed > 0 ? 'consistency-strip__dot consistency-strip__dot--filled' : 'consistency-strip__dot'
            }
          >
            <title>{`${date} — ${completed} session${completed === 1 ? '' : 's'}`}</title>
          </circle>
        );
      })}

      {WEEKDAY_LABELS.map((label, row) => (
        <text
          key={`row-label-${row}`}
          x={GRID_LEFT - 10}
          y={GRID_TOP + row * DOT_GAP_Y + DOT_GAP_Y / 2 + 3}
          textAnchor="end"
          className="chart-caption"
        >
          {label}
        </text>
      ))}

      {byWeekday.map((count, index) => {
        const barHeight = Math.max((count / maxWeekday) * BAR_MAX_HEIGHT, count > 0 ? 2 : 0);
        const x = GRID_LEFT + index * (BAR_WIDTH + BAR_GAP);
        const y = BARS_TOP + BAR_MAX_HEIGHT - barHeight;

        return (
          <g key={`bar-${index}`}>
            <title>{`${WEEKDAY_LABELS[index]} — ${count} session${count === 1 ? '' : 's'}`}</title>
            <rect x={x} y={BARS_TOP} width={BAR_WIDTH} height={BAR_MAX_HEIGHT} fill="transparent" />
            {barHeight > 0 ? (
              <rect x={x} y={y} width={BAR_WIDTH} height={barHeight} className="consistency-strip__bar" />
            ) : null}
            <text x={x + BAR_WIDTH / 2} y={BARS_TOP + BAR_MAX_HEIGHT + 16} textAnchor="middle" className="chart-caption">
              {WEEKDAY_LABELS[index]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
