import { useDeferredValue, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  Salad,
  Search,
  Trash2,
  Utensils,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Field, Input, NumberField, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { MacroSummary } from '@/components/macros/MacroSummary'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { nutritionService } from '@/services'
import { friendlyDate, shiftDate, today } from '@/lib/date'
import { grams, kcal, num } from '@/lib/format'
import { MEAL_LABEL } from '@/lib/format'
import { MEAL_TYPES } from '@/types'
import type { Food, FoodLogEntry, MealType } from '@/types'
import type { LogFoodPayload } from '@/services'

export function NutritionPage() {
  const user = useAuthStore((s) => s.user)
  const push = useToastStore((s) => s.push)
  if (!user) return null

  return <NutritionView userId={user.id} onToast={push} />
}

/** Sensible default meal when opening the picker from the page header. */
function mealForNow(): MealType {
  const hour = new Date().getHours()
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

function NutritionView({
  userId,
  onToast,
}: {
  userId: string
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void
}) {
  const [date, setDate] = useState(today())
  const [adding, setAdding] = useState(false)
  const [addMeal, setAddMeal] = useState<MealType>('breakfast')
  const [editing, setEditing] = useState<FoodLogEntry | null>(null)

  const day = useAsync(() => nutritionService.getDay(userId, date), [userId, date])
  const copy = useAction((from: string, to: string) => nutritionService.copyDay(userId, from, to))
  const remove = useAction((id: string) => nutritionService.deleteLog(userId, id))

  function handleDelete(entry: FoodLogEntry) {
    void remove.run(entry.id).then((ok) => {
      if (ok === null) {
        onToast(remove.error ?? 'Could not delete entry', 'error')
        return
      }
      onToast('Entry removed', 'info')
      day.reload()
    })
  }

  function handleCopyYesterday() {
    void copy.run(shiftDate(date, -1), date).then((count) => {
      if (count === null) {
        onToast(copy.error ?? 'Could not copy that day', 'error')
        return
      }
      onToast(`${count} ${count === 1 ? 'entry' : 'entries'} copied from yesterday`, 'success')
      day.reload()
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Nutrition"
        subtitle="Log food, hit your macros, stay on track."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9.5 items-center overflow-hidden rounded-lg border border-line bg-surface">
              <button
                type="button"
                onClick={() => setDate(shiftDate(date, -1))}
                aria-label="Previous day"
                className="flex size-9.5 items-center justify-center text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-[7.5rem] text-center text-[13px] font-semibold text-ink">
                {friendlyDate(date)}
              </span>
              <button
                type="button"
                onClick={() => setDate(shiftDate(date, 1))}
                aria-label="Next day"
                className="flex size-9.5 items-center justify-center text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            {date !== today() && (
              <Button variant="outline" size="md" onClick={() => setDate(today())}>
                Today
              </Button>
            )}
            <Button
              onClick={() => {
                setAddMeal(mealForNow())
                setAdding(true)
              }}
            >
              <Plus className="size-4" /> Add food
            </Button>
          </div>
        }
      />

      {day.loading || !day.data ? (
        <div className="grid gap-4">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <MacroSummary
            totals={day.data.totals}
            target={day.data.target}
            label={date === today() ? "Today's macros" : `${friendlyDate(date)}'s macros`}
          />

          {day.data.entries.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Salad className="size-5" />}
                title={`Nothing logged on ${friendlyDate(date).toLowerCase()}`}
                description="Add food from the library, or copy a previous day across to hit the ground running."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="outline" onClick={handleCopyYesterday} loading={copy.loading}>
                      <Copy className="size-3.5" /> Copy yesterday
                    </Button>
                    <Button onClick={() => setAdding(true)}>
                      <Plus className="size-3.5" /> Add food
                    </Button>
                  </div>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {MEAL_TYPES.map((meal) => {
                const section = day.data!.by_meal[meal]
                return (
                  <MealCard
                    key={meal}
                    meal={meal}
                    section={section}
                    onEdit={setEditing}
                    onDelete={handleDelete}
                    onAdd={() => {
                      setAddMeal(meal)
                      setAdding(true)
                    }}
                  />
                )
              })}
            </div>
          )}
        </>
      )}

      {adding && (
        <AddFoodModal
          userId={userId}
          logDate={date}
          defaultMeal={addMeal}
          onClose={() => setAdding(false)}
          onAdded={day.reload}
        />
      )}

      {editing && (
        <EditEntryModal
          userId={userId}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={day.reload}
        />
      )}
    </div>
  )
}

function MealCard({
  meal,
  section,
  onEdit,
  onDelete,
  onAdd,
}: {
  meal: MealType
  section: { entries: FoodLogEntry[]; totals: { calories: number } }
  onEdit: (entry: FoodLogEntry) => void
  onDelete: (entry: FoodLogEntry) => void
  onAdd: () => void
}) {
  return (
    <Card>
      <CardHeader
        title={MEAL_LABEL[meal]}
        icon={<Utensils className="size-4" />}
        action={
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tabular-nums text-ink-muted">
              {kcal(section.totals.calories)}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={onAdd}
              aria-label={`Add food to ${MEAL_LABEL[meal].toLowerCase()}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </span>
        }
      />
      <CardBody className="pt-1">
        {section.entries.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="w-full rounded-lg border border-dashed border-line py-3.5 text-[12.5px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
          >
            Nothing logged for {MEAL_LABEL[meal].toLowerCase()} — add something
          </button>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {section.entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{entry.food.name}</p>
                  <p className="text-[12px] text-ink-faint">
                    {entry.food.brand ? `${entry.food.brand} · ` : ''}
                    P {num(entry.macros.protein_g, 1)}g · C {num(entry.macros.carbs_g, 1)}g · F{' '}
                    {num(entry.macros.fat_g, 1)}g
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold tabular-nums text-ink">
                    {kcal(entry.macros.calories)}
                  </p>
                  <p className="text-[11.5px] text-ink-faint">{grams(entry.quantity_g)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Edit entry"
                    onClick={() => onEdit(entry)}
                    className="flex size-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete entry"
                    onClick={() => onDelete(entry)}
                    className="flex size-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function EditEntryModal({
  userId,
  entry,
  onClose,
  onSaved,
}: {
  userId: string
  entry: FoodLogEntry
  onClose: () => void
  onSaved: () => void
}) {
  const push = useToastStore((s) => s.push)
  const [grams, setGrams] = useState<number | null>(entry.quantity_g)
  const [meal, setMeal] = useState<MealType>(entry.meal_type)

  const update = useAction((q: number | null, m: MealType) =>
    nutritionService.updateLog(userId, entry.id, {
      quantity_g: q ?? entry.quantity_g,
      meal_type: m,
    }),
  )

  function save() {
    void update.run(grams, meal).then((ok) => {
      if (ok === null) {
        push(update.error ?? 'Could not save entry', 'error')
        return
      }
      push('Entry updated', 'success')
      onSaved()
      onClose()
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit entry"
      description={entry.food.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={update.loading}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Quantity">
          <NumberField
            value={grams}
            onValueChange={setGrams}
            suffix="g"
            min={1}
            placeholder="0"
          />
        </Field>
        <Field label="Meal">
          <Select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
            {MEAL_TYPES.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        {update.error && (
          <p className="text-[12.5px] text-danger" role="alert">
            {update.error}
          </p>
        )}
      </div>
    </Modal>
  )
}

function AddFoodModal({
  userId,
  logDate,
  defaultMeal,
  onClose,
  onAdded,
}: {
  userId: string
  logDate: string
  defaultMeal: MealType
  onClose: () => void
  onAdded: () => void
}) {
  const push = useToastStore((s) => s.push)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selected, setSelected] = useState<Food | null>(null)
  const [grams, setGrams] = useState<number | null>(null)
  const [meal, setMeal] = useState<MealType>(defaultMeal)
  const [creating, setCreating] = useState(false)

  const foods = useAsync(
    () =>
      deferredQuery.trim()
        ? nutritionService.searchFoods(userId, deferredQuery)
        : nutritionService.frequentFoods(userId),
    [userId, deferredQuery],
  )

  const addLog = useAction((p: LogFoodPayload) => nutritionService.logFood(userId, p))

  function close() {
    setQuery('')
    setSelected(null)
    setGrams(null)
    setCreating(false)
    onClose()
  }

  function pick(food: Food) {
    setSelected(food)
    setGrams(food.serving_g ?? 100)
  }

  function submit() {
    if (!selected || grams === null || grams <= 0) return
    void addLog.run({ food_id: selected.id, log_date: logDate, quantity_g: grams, meal_type: meal }).then(
      (ok) => {
        if (ok === null) {
          push(addLog.error ?? 'Could not log food', 'error')
          return
        }
        push(`Logged ${selected.name}`, 'success')
        onAdded()
        close()
      },
    )
  }

  return (
    <Modal
      open
      onClose={close}
      title={creating ? 'Create a custom food' : 'Add food'}
      description={
        creating
          ? 'Nutrition per 100 g — the values you see on the packet.'
          : 'Search the library or pick a recent food.'
      }
      size="lg"
    >
      {creating ? (
        <CustomFoodForm
          userId={userId}
          logDate={logDate}
          meal={meal}
          onDone={() => {
            push('Custom food created and logged', 'success')
            onAdded()
            close()
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search foods…"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto scrollbar-thin">
            {foods.loading ? (
              <div className="flex flex-col gap-2 p-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : foods.data && foods.data.length > 0 ? (
              foods.data.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => pick(food)}
                  className={`flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                    selected?.id === food.id ? 'bg-volt-soft' : 'hover:bg-surface-2'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{food.name}</p>
                    <p className="text-[12px] text-ink-faint">
                      {food.brand ? `${food.brand} · ` : ''}
                      {kcal(food.calories_per_100g)} / 100g
                      {food.serving_label ? ` · ${food.serving_label}` : ''}
                    </p>
                  </div>
                  {food.is_custom && (
                    <Badge tone="info" size="sm">
                      Custom
                    </Badge>
                  )}
                </button>
              ))
            ) : (
              <EmptyState
                title="No foods found"
                description="No match for that search — create a custom food instead."
              />
            )}
          </div>

          {selected && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13.5px] font-semibold text-ink">{selected.name}</p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Clear selection"
                  className="text-ink-faint transition-colors hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Field label="Quantity">
                  <NumberField value={grams} onValueChange={setGrams} suffix="g" min={1} placeholder="0" />
                </Field>
                <Field label="Meal">
                  <Select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
                    {MEAL_TYPES.map((m) => (
                      <option key={m} value={m}>
                        {MEAL_LABEL[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  onClick={submit}
                  loading={addLog.loading}
                  disabled={grams === null || grams <= 0}
                >
                  <Plus className="size-3.5" /> Add
                </Button>
              </div>
              {addLog.error && (
                <p className="text-[12.5px] text-danger" role="alert">
                  {addLog.error}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setCreating(true)}
            className="self-start text-[13px] font-semibold text-volt transition-colors hover:text-volt-dim"
          >
            + Create a custom food
          </button>
        </div>
      )}
    </Modal>
  )
}

function CustomFoodForm({
  userId,
  logDate,
  meal,
  onDone,
  onCancel,
}: {
  userId: string
  logDate: string
  meal: MealType
  onDone: () => void
  onCancel: () => void
}) {
  const push = useToastStore((s) => s.push)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [calories, setCalories] = useState<number | null>(null)
  const [protein, setProtein] = useState<number | null>(null)
  const [carbs, setCarbs] = useState<number | null>(null)
  const [fat, setFat] = useState<number | null>(null)
  const [servingLabel, setServingLabel] = useState('')
  const [servingG, setServingG] = useState<number | null>(null)

  const create = useAction(() =>
    nutritionService.createFood(userId, {
      name,
      brand: brand.trim() || null,
      calories_per_100g: calories ?? 0,
      protein_per_100g: protein ?? 0,
      carbs_per_100g: carbs ?? 0,
      fat_per_100g: fat ?? 0,
      serving_label: servingLabel.trim() || null,
      serving_g: servingG,
    }),
  )

  function submit() {
    void create.run().then((food) => {
      if (!food) {
        push(create.error ?? 'Could not create food', 'error')
        return
      }
      const quantity = servingG ?? 100
      void nutritionService
        .logFood(userId, { food_id: food.id, log_date: logDate, quantity_g: quantity, meal_type: meal })
        .then(onDone)
        .catch(() => {
          push('Food created, but logging it failed', 'error')
          onDone()
        })
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="cf-name">
          <Input
            id="cf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Homemade granola"
          />
        </Field>
        <Field label="Brand (optional)" htmlFor="cf-brand">
          <Input
            id="cf-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. My Kitchen"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Calories">
          <NumberField value={calories} onValueChange={setCalories} suffix="kcal" min={0} placeholder="0" />
        </Field>
        <Field label="Protein">
          <NumberField value={protein} onValueChange={setProtein} suffix="g" min={0} placeholder="0" />
        </Field>
        <Field label="Carbs">
          <NumberField value={carbs} onValueChange={setCarbs} suffix="g" min={0} placeholder="0" />
        </Field>
        <Field label="Fat">
          <NumberField value={fat} onValueChange={setFat} suffix="g" min={0} placeholder="0" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Serving label (optional)" hint="e.g. 1 bowl (120 g)">
          <Input
            value={servingLabel}
            onChange={(e) => setServingLabel(e.target.value)}
            placeholder="e.g. 1 bowl (120 g)"
          />
        </Field>
        <Field label="Serving weight (optional)">
          <NumberField value={servingG} onValueChange={setServingG} suffix="g" min={1} placeholder="100" />
        </Field>
      </div>

      {create.error && (
        <p className="text-[12.5px] text-danger" role="alert">
          {create.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          Back to search
        </button>
        <Button onClick={submit} loading={create.loading} disabled={!name.trim()}>
          Create & log it
        </Button>
      </div>
    </div>
  )
}
