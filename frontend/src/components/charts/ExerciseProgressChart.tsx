import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, TooltipRow } from '@/components/charts/ChartTooltip'
import { shortDate } from '@/lib/date'
import { num } from '@/lib/format'
import type { ExerciseHistoryPoint } from '@/types'

/**
 * Progression for a single exercise: estimated 1RM (Epley) per session as the
 * primary line, session volume behind it, and a marker on every session that
 * set a personal record.
 */
export function ExerciseProgressChart({
  points,
  height = 280,
}: {
  points: ExerciseHistoryPoint[]
  height?: number
}) {
  const data = points.map((p) => ({
    ...p,
    label: shortDate(p.date),
    // Separate series so PR sessions get a visible marker without a custom dot renderer.
    pr_1rm: p.is_pr ? p.estimated_1rm : null,
  }))

  const volumeMax = Math.max(...data.map((d) => d.volume_kg), 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -14 }}>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          domain={['dataMin - 5', 'dataMax + 5']}
          width={44}
          tickFormatter={(v: number) => String(Math.round(v))}
        />
        <YAxis yAxisId="volume" orientation="right" hide domain={[0, Math.max(volumeMax, 1) * 1.6]} />
        <Tooltip
          cursor={{ stroke: 'var(--color-line-strong)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as (typeof data)[number]
            return (
              <ChartTooltip label={label}>
                <TooltipRow
                  color="var(--color-volt)"
                  name="Est. 1RM"
                  value={`${num(p.estimated_1rm, 1)} kg`}
                />
                <TooltipRow
                  color="var(--color-ink-faint)"
                  name="Top set"
                  value={`${num(p.best_weight_kg, 1)} kg × ${p.best_reps}`}
                />
                <TooltipRow
                  color="var(--color-protein)"
                  name="Volume"
                  value={`${num(p.volume_kg)} kg`}
                />
                {p.is_pr && (
                  <p className="mt-1 text-[11.5px] font-semibold text-volt">Personal record</p>
                )}
              </ChartTooltip>
            )
          }}
        />
        <Bar
          isAnimationActive={false}
          dataKey="volume_kg"
          yAxisId="volume"
          fill="var(--color-protein)"
          opacity={0.14}
          radius={[3, 3, 0, 0]}
          barSize={10}
        />
        <Line
          isAnimationActive={false}
          dataKey="estimated_1rm"
          stroke="var(--color-volt)"
          strokeWidth={2.5}
          dot={{ r: 2.5, fill: 'var(--color-volt)', strokeWidth: 0 }}
          activeDot={{ r: 4.5 }}
          connectNulls
        />
        <Line
          isAnimationActive={false}
          dataKey="pr_1rm"
          stroke="transparent"
          strokeWidth={0}
          legendType="none"
          dot={{ r: 4.5, fill: 'var(--color-volt)', stroke: 'var(--color-canvas)', strokeWidth: 2 }}
          activeDot={false}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
