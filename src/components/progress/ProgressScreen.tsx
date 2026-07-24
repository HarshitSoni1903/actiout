import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  getBodyweightTrend,
  getConsistency,
  getExerciseHistory,
  getLoggedExerciseNames,
  getPRs,
  getSequenceStats,
} from '../../services/analytics-service';
import { deleteBodyweight, listBodyweight } from '../../services/bodyweight-service';
import { getPreferences } from '../../services/preference-service';
import { formatWeight } from '../../domain/units';
import { formatShortDate } from '../../utils';
import { useUiStore } from '../../state/ui-store';
import { SegmentedControl } from '../common/SegmentedControl';
import type { SegmentedControlOption } from '../common/SegmentedControl';
import { BodyweightChart } from './BodyweightChart';
import { CONSISTENCY_DAYS, ConsistencyStrip } from './ConsistencyStrip';
import { ExercisePicker } from './ExercisePicker';
import { HistoryList } from './HistoryList';
import { PRBlock } from './PRBlock';
import { SequenceChart } from './SequenceChart';
import './progress.css';

type Tab = 'exercises' | 'body' | 'consistency';

const TAB_OPTIONS: SegmentedControlOption[] = [
  { value: 'exercises', label: 'Exercises' },
  { value: 'body', label: 'Body' },
  { value: 'consistency', label: 'Consistency' },
];

export function ProgressScreen() {
  const showToast = useUiStore((state) => state.showToast);
  const [tab, setTab] = useState<Tab>('exercises');
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [includeDnf, setIncludeDnf] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const preferences = useLiveQuery(() => getPreferences(), []);
  const unit = preferences?.weightUnit ?? 'lb';

  const exerciseNames = useLiveQuery(() => getLoggedExerciseNames(), []);

  const prs = useLiveQuery(
    () => (selectedExercise ? getPRs(selectedExercise, unit, includeDnf) : undefined),
    [selectedExercise, unit, includeDnf]
  );
  const sequenceStats = useLiveQuery(
    () => (selectedExercise ? getSequenceStats(selectedExercise, unit, includeDnf) : undefined),
    [selectedExercise, unit, includeDnf]
  );
  const history = useLiveQuery(
    () => (selectedExercise ? getExerciseHistory(selectedExercise, includeDnf) : undefined),
    [selectedExercise, includeDnf]
  );

  const bodyweightEntries = useLiveQuery(() => listBodyweight(), []);
  const bodyweightTrend = useLiveQuery(() => getBodyweightTrend(unit), [unit]);

  const consistency = useLiveQuery(() => getConsistency(CONSISTENCY_DAYS), []);

  async function handleDeleteBodyweight(id: string) {
    try {
      await deleteBodyweight(id);
      showToast('Entry deleted');
    } catch {
      showToast('Could not delete entry.', 'error');
    } finally {
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="progress-screen">
      <h1 className="progress-screen__title">Progress</h1>
      <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={(value) => setTab(value as Tab)} />

      {tab === 'exercises' ? (
        <div className="progress-screen__section">
          <ExercisePicker exercises={exerciseNames ?? []} selected={selectedExercise} onSelect={setSelectedExercise} />
          {selectedExercise ? (
            <>
              <PRBlock prs={prs ?? {}} unit={unit} includeDnf={includeDnf} onIncludeDnfChange={setIncludeDnf} />
              <SequenceChart stats={sequenceStats ?? []} unit={unit} />
              <HistoryList entries={history ?? []} />
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'body' ? (
        <div className="progress-screen__section">
          <BodyweightChart points={bodyweightTrend ?? []} unit={unit} />
          {(bodyweightEntries ?? []).length > 0 ? (
            <ul className="bodyweight-entry-list">
              {(bodyweightEntries ?? []).map((entry) => (
                <li key={entry.id} className="bodyweight-entry-list__row">
                  <div className="bodyweight-entry-list__main">
                    <span className="bodyweight-entry-list__date">{formatShortDate(entry.entryDate)}</span>
                    <span className="bodyweight-entry-list__value">
                      {formatWeight(entry.weightValue, entry.weightUnit)}
                    </span>
                  </div>
                  {confirmDeleteId === entry.id ? (
                    <span className="bodyweight-entry-list__confirm">
                      <button
                        type="button"
                        className="bodyweight-entry-list__confirm-btn"
                        onClick={() => void handleDeleteBodyweight(entry.id)}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="bodyweight-entry-list__cancel-btn"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="bodyweight-entry-list__remove-btn"
                      aria-label={`Delete entry from ${formatShortDate(entry.entryDate)}`}
                      onClick={() => setConfirmDeleteId(entry.id)}
                    >
                      &times;
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {tab === 'consistency' ? (
        <div className="progress-screen__section">
          <ConsistencyStrip byDate={consistency?.byDate ?? []} days={CONSISTENCY_DAYS} />
        </div>
      ) : null}
    </div>
  );
}
