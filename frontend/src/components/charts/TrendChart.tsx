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
import type { TrendPoint } from '@/types'

/** Smoothed weight trend (line) with raw weigh-ins (dots) and a training-volume overlay. */
export function TrendChart({ points, height = 260 }: { points: TrendPoint[]; height?: number }) {
  const data = points.map((p) => ({
    ...p,
    label: shortDate(p.date),
    weight: p.weight_kg,
    trend: p.trend_kg,
    volume: p.volume_kg,
  }))

  const volumeMax = Math.max(...data.map((d) => d.volume ?? 0), 0)
  const hasVolume = volumeMax > 0

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -18 }}>
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
          domain={['auto', 'auto']}
          width={44}
          tickFormatter={(v: number) => String(v)}
        />
        {hasVolume && <YAxis yAxisId="volume" orientation="right" hide domain={[0, volumeMax * 1.4]} />}
        <Tooltip
          cursor={{ stroke: 'var(--color-line-strong)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as (typeof data)[number]
            return (
              <ChartTooltip label={label}>
                {p.weight !== null && (
                  <TooltipRow color="var(--color-ink-faint)" name="Raw" value={`${num(p.weight, 1)} kg`} />
                )}
                {p.trend !== null && (
                  <TooltipRow color="var(--color-volt)" name="Trend" value={`${num(p.trend, 2)} kg`} />
                )}
                {p.volume !== null && p.volume > 0 && (
                  <TooltipRow color="var(--color-protein)" name="Volume" value={`${num(p.volume)} kg`} />
                )}
                {p.calories !== null && (
                  <TooltipRow color="var(--color-warning)" name="Calories" value={`${num(p.calories)}`} />
                )}
              </ChartTooltip>
            )
          }}
        />
        {hasVolume && (
          <Bar
          isAnimationActive={false}
            dataKey="volume"
            fill="var(--color-protein)"
            opacity={0.14}
            radius={[3, 3, 0, 0]}
            barSize={7}
            yAxisId="volume"
          />
        )}
        <Line
          isAnimationActive={false}
          dataKey="weight"
          stroke="var(--color-ink-faint)"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="2 3"
          connectNulls
        />
        <Line
          isAnimationActive={false}
          dataKey="trend"
          stroke="var(--color-volt)"
          strokeWidth={2.5}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
