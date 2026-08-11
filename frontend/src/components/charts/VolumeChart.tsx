import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, TooltipRow } from '@/components/charts/ChartTooltip'
import { shortDate } from '@/lib/date'
import { num } from '@/lib/format'
import { MUSCLE_COLOR, MUSCLE_LABEL } from '@/lib/format'
import { MUSCLE_GROUPS } from '@/types'
import type { WeeklyVolumePoint, MuscleGroup } from '@/types'

export function VolumeChart({ points, height = 260 }: { points: WeeklyVolumePoint[]; height?: number }) {
  const data = points.map((p) => ({
    ...p,
    label: shortDate(p.week_start),
    total: p.by_muscle_group ? Object.values(p.by_muscle_group).reduce((a, b) => a + b, 0) : 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -18 }}>
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
          width={44}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-surface-3)', opacity: 0.4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as (typeof data)[number]
            const entries = MUSCLE_GROUPS.filter((g) => (p.by_muscle_group?.[g] ?? 0) > 0)
            return (
              <ChartTooltip label={label}>
                {p.total > 0 && <TooltipRow color="var(--color-volt)" name="Total" value={`${num(p.total)} kg`} />}
                {entries.slice(0, 6).map((g: MuscleGroup) => (
                  <TooltipRow
                    key={g}
                    color={MUSCLE_COLOR[g]}
                    name={MUSCLE_LABEL[g]}
                    value={`${num(p.by_muscle_group![g])} kg`}
                  />
                ))}
              </ChartTooltip>
            )
          }}
        />
        {MUSCLE_GROUPS.map((g) => (
          <Bar
          isAnimationActive={false}
            key={g}
            dataKey={(d: (typeof data)[number]) => d.by_muscle_group?.[g] ?? 0}
            stackId="vol"
            fill={MUSCLE_COLOR[g]}
            opacity={0.85}
            radius={0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
