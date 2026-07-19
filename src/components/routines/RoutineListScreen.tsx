import { Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Anchor, Badge, Button, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { listRoutines } from '../../services/routine-service';
import { useStartSession } from '../home/useStartSession';
import { summaryLine } from './routine-summary';

export function RoutineListScreen() {
  const navigate = useNavigate();
  const routines = useLiveQuery(() => listRoutines(), []);
  const loaded = routines !== undefined;
  const { attemptStart, conflictModal } = useStartSession();

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1}>Routines</Title>
        <Text c="dimmed" size="sm">
          Create and customize your workouts.
        </Text>
      </Stack>

      <Button size="lg" fullWidth onClick={() => navigate('/routines/new')}>
        + New routine
      </Button>

      <Stack gap="md">
        <Text size="sm" fw={700} c="dimmed" tt="uppercase">
          Your routines
        </Text>

        {loaded && routines.length === 0 ? (
          <Text c="dimmed" size="sm">
            No routines yet. Create one to plan your workouts.
          </Text>
        ) : (
          (routines ?? []).map((routine, index) => (
            <Fragment key={routine.id}>
              {index > 0 ? <Divider /> : null}
              <Stack gap={6}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Title order={3}>{routine.name}</Title>
                  {routine.timeOfDay ? (
                    <Badge variant="light" color="gray">
                      {routine.timeOfDay}
                    </Badge>
                  ) : null}
                </Group>

                {routine.items.length > 0 ? (
                  <Text c="dimmed" size="sm">
                    {summaryLine(routine)}
                  </Text>
                ) : null}

                <Group justify="space-between" align="center" wrap="nowrap">
                  <Button size="lg" onClick={() => void attemptStart([routine.id])}>
                    Start workout
                  </Button>
                  <Anchor component={Link} to={`/routines/${routine.id}`} size="sm" c="dimmed">
                    Edit
                  </Anchor>
                </Group>
              </Stack>
            </Fragment>
          ))
        )}
      </Stack>

      {conflictModal}
    </Stack>
  );
}
