import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { RoutineItemRow, type RoutineItemRowProps } from './RoutineItemRow';

export type SortableRoutineRowProps = Omit<RoutineItemRowProps, 'dragHandle'> & {
  clientId: string;
};

// Mirrors SortableSessionRow: listeners/attributes attach only to the grip
// handle so the row's inputs stay independently usable while dragging.
export function SortableRoutineRow({ clientId, ...rowProps }: SortableRoutineRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: clientId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragHandle = (
    <ActionIcon
      variant="subtle"
      color="gray"
      aria-label={`Reorder ${rowProps.item.exerciseName}`}
      {...attributes}
      {...listeners}
    >
      <IconGripVertical size={18} />
    </ActionIcon>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <RoutineItemRow {...rowProps} dragHandle={dragHandle} />
    </div>
  );
}
