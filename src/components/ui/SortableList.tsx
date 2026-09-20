// src/components/ui/SortableList.tsx
//
// Wrapper réutilisable autour de dnd-kit pour les listes verticales
// ré-ordonnables à la souris (PointerSensor) ou au clavier (KeyboardSensor,
// a11y). Chaque item est wrappé dans un `SortableItem` avec une poignée
// `GripVertical`. Les ids désactivés (`disabledIds`) sont présents dans la
// liste mais non draggable — utilisé par le panneau "Priorité des sources"
// pour griser les hosters désactivés dans la section Extracteurs.
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export const SortableItem: React.FC<SortableItemProps> = ({ id, children, disabled }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={cn('flex items-center gap-2', disabled && 'opacity-50')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        // touch-none indispensable : sans ça, le navigateur mobile capte le
        // touchmove pour scroller la modale et le PointerSensor ne déclenche
        // jamais le drag.
        className={cn(
          'cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-200 p-1 rounded touch-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
          disabled && 'cursor-not-allowed pointer-events-none',
        )}
        aria-label={t('settings.sourcePriority.reorderAria')}
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
};

interface SortableListProps {
  /** Ids ordonnés (source de vérité). */
  items: string[];
  /** Ids présents mais non-draggables. Typiquement utilisé pour griser
   *  des items rendus désactivés par un autre réglage. */
  disabledIds?: string[];
  /** Callback appelé après un drag valide avec l'ordre résultant. */
  onReorder: (newOrder: string[]) => void;
  /** Renderer d'un item individuel (hors poignée drag). */
  renderItem: (id: string) => React.ReactNode;
  className?: string;
}

export const SortableList: React.FC<SortableListProps> = ({
  items, disabledIds = [], onReorder, renderItem, className,
}) => {
  const sensors = useSensors(
    // Distance de 5px avant d'initier un drag — évite les drags accidentels
    // au click.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      // Restreint le déplacement à l'axe vertical + à l'intérieur du parent
      // (empêche la card de s'échapper à droite/gauche ou hors de la modale).
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className={cn('flex flex-col gap-1', className)}>
          {items.map((id) => (
            <SortableItem key={id} id={id} disabled={disabledIds.includes(id)}>
              {renderItem(id)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default SortableList;
