"use client";

import { useId } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FieldProps } from "./types";

function RankingRow({ id, label, index }: { id: string; label: string; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="card flex items-center gap-3 p-3">
      <button
        type="button"
        className="cursor-grab touch-none px-1 text-lg text-[var(--color-ink-soft)]"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="flex-1">
        {index + 1}. {label}
      </span>
    </div>
  );
}

/** The one drag-and-drop interaction on the participant side (design doc §4). */
export function RankingField({ question, value, onChange }: FieldProps) {
  const dndId = useId();
  const options = question.options ?? [];
  const order =
    Array.isArray(value) && value.length === options.length
      ? value
      : options.map((o) => o.value);
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(order, oldIndex, newIndex));
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {order.map((v, i) => (
            <RankingRow key={v} id={v} label={labelFor(v)} index={i} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
