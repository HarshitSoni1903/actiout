import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { SessionItemCard, type SessionItemCardProps } from './SessionItemCard';

export type SortableSessionRowProps = Omit<SessionItemCardProps, 'dragHandle'>;

// Wraps a queued SessionItemCard in dnd-kit's sortable behavior. The
// listeners/attributes attach only to the grip ActionIcon (not the card), so
// a plain tap on the card body keeps reaching SessionItemCard's onToggle.
export function SortableSessionRow(props: SortableSessionRowProps) {
  const { item } = props;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragHandle = (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="lg"
      aria-label={`Reorder ${item.exerciseNameSnapshot}`}
      {...attributes}
      {...listeners}
    >
      <IconGripVertical size={18} />
    </ActionIcon>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <SessionItemCard {...props} dragHandle={dragHandle} />
    </div>
  );
}
