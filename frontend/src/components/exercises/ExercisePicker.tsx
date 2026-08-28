import { useState } from 'react'
import { ListPlus, Plus, Search, X } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Field'
import { useAsync, useAction } from '@/hooks/useAsync'
import { workoutService } from '@/services'
import { EQUIPMENT_LABEL, MUSCLE_COLOR, MUSCLE_LABEL } from '@/lib/format'
import { EQUIPMENT, MUSCLE_GROUPS } from '@/types'
import type { Exercise, Equipment, MuscleGroup } from '@/types'

/**
 * Search + create an exercise, then hand the pick back to the caller.
 * Used by the active-session view and the routine editor.
 */
export function ExercisePicker({
  userId,
  onPick,
  onClose,
}: {
  userId: string
  onPick: (ex: Exercise) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const results = useAsync(() => workoutService.listExercises(userId, { search: query }), [query, userId])
  const create = useAction(
    (name: string, muscle_group: MuscleGroup, equipment: Equipment) =>
      workoutService.createExercise(userId, { name, muscle_group, equipment }),
  )
  const [newName, setNewName] = useState('')
  const [newMuscle, setNewMuscle] = useState<MuscleGroup>('chest')
  const [newEquipment, setNewEquipment] = useState<Equipment>('machine')

  return (
    <Card className="border-volt/30">
      <CardHeader
        title="Add exercise"
        subtitle="Pick from the library, or create your own — it's saved to your account."
        icon={<ListPlus className="size-4" />}
        action={
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        }
      />
      <CardBody className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises…"
            className="pl-9"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-line scrollbar-thin">
          {results.loading ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : results.data && results.data.length > 0 ? (
            <ul className="flex flex-col">
              {results.data.map((ex) => (
                <li key={ex.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onPick(ex)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: MUSCLE_COLOR[ex.muscle_group] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{ex.name}</span>
                      <span className="block text-[11.5px] text-ink-faint">{MUSCLE_LABEL[ex.muscle_group]}</span>
                    </span>
                    <Plus className="size-4 shrink-0 text-volt" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="py-6"
              icon={<Search className="size-5" />}
              title={`No exercises match "${query}"`}
              description="Create a custom exercise instead."
            />
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (newName.trim() === '') return
            void create.run(newName.trim(), newMuscle, newEquipment).then((ex) => {
              if (ex) {
                setNewName('')
                setNewMuscle('chest')
                setNewEquipment('machine')
                onPick(ex)
              }
            })
          }}
          className="mt-1 flex flex-col gap-3 rounded-lg border border-line bg-surface/40 p-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Muscle group" htmlFor="picker-muscle">
              <Select
                id="picker-muscle"
                value={newMuscle}
                onChange={(e) => setNewMuscle(e.target.value as MuscleGroup)}
              >
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m} value={m}>
                    {MUSCLE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Equipment" htmlFor="picker-equipment">
              <Select
                id="picker-equipment"
                value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value as Equipment)}
              >
                {EQUIPMENT.map((e) => (
                  <option key={e} value={e}>
                    {EQUIPMENT_LABEL[e]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Custom exercise name (e.g. Landmine press)"
              className="flex-1"
            />
            <Button size="sm" type="submit" loading={create.loading}>
              <Plus className="size-3.5" /> Create
            </Button>
          </div>
        </form>
        {create.error && <p className="text-[12.5px] text-danger">{create.error}</p>}
      </CardBody>
    </Card>
  )
}
