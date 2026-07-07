import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listRoutines } from '../../services/routine-service';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import './routines.css';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function DayDots({ daysOfWeek }: { daysOfWeek: number[] }) {
  const active = new Set(daysOfWeek);
  return (
    <span className="day-dots" aria-hidden="true">
      {WEEKDAY_LABELS.map((label, index) => (
        <span
          key={index}
          className={`day-dots__dot${active.has(index) ? ' day-dots__dot--active' : ''}`}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

export function RoutineListScreen() {
  const navigate = useNavigate();
  const routines = useLiveQuery(() => listRoutines(), []);
  const loaded = routines !== undefined;

  return (
    <div className="routine-list">
      <div className="routine-list__header">
        <h1 className="routine-list__title">Routines</h1>
        <Button variant="primary" onClick={() => navigate('/routines/new')}>
          New routine
        </Button>
      </div>

      {loaded && routines.length === 0 ? (
        <EmptyState
          title="No routines yet"
          description="Create a routine to plan your workouts and see it here."
          action={
            <Button variant="primary" onClick={() => navigate('/routines/new')}>
              New routine
            </Button>
          }
        />
      ) : (
        <ul className="routine-list__rows">
          {(routines ?? []).map((routine) => (
            <li key={routine.id}>
              <button
                type="button"
                className="routine-list__row"
                onClick={() => navigate(`/routines/${routine.id}`)}
              >
                <span className="routine-list__row-main">
                  <span className="routine-list__name">{routine.name}</span>
                  {routine.category ? (
                    <span className="routine-list__category-chip">{routine.category}</span>
                  ) : null}
                </span>
                <span className="routine-list__row-meta">
                  <DayDots daysOfWeek={routine.daysOfWeek} />
                  <span className="routine-list__count">
                    {routine.items.length} {routine.items.length === 1 ? 'exercise' : 'exercises'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
