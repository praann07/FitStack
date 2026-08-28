import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, TooltipRow } from '@/components/charts/ChartTooltip'
import { shortDate } from '@/lib/date'
import { num } from '@/lib/format'
import type { SetHistoryPoint } from '@/types'

/** Distinguishable line colours for set indices 2+, using existing theme tokens
 * so they read on the dark canvas (set 1 stays volt to match the top-set chart). */
const SET_PALETTE = [
  'var(--color-protein)',
  'var(--color-fat)',
  'var(--color-carbs)',
  'var(--color-info)',
  'var(--color-positive)',
  'var(--color-warning)',
]

/**
 * Epley 1RM per set-index across sessions — each working set is its own line,
 * drawn only where it was logged ("plot what exists, gap where missing").
 */
export function SetProgressionChart({
  points,
  height = 280,
}: {
  points: SetHistoryPoint[]
  height?: number
}) {
  const maxIndex = points.reduce((m, p) => Math.max(m, ...Object.keys(p.by_set).map(Number)), 0)
  if (maxIndex === 0) return null

  const data = points.map((p) => {
    const row: Record<string, number | string | null> = { label: shortDate(p.date) }
    for (let i = 1; i <= maxIndex; i++) {
      row[String(i)] = p.by_set[i]?.e1rm ?? null
    }
    return row
  })

  const indices = Array.from({ length: maxIndex }, (_, k) => k + 1)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={28}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          domain={['dataMin - 4', 'dataMax + 4']}
          width={44}
          tickFormatter={(v: number) => String(Math.round(v))}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-line-strong)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as Record<string, number | string | null>
            return (
              <ChartTooltip label={label}>
                {indices.map((i) => {
                  const v = row[String(i)] as number | null | undefined
                  return (
                    <TooltipRow
                      key={i}
                      color={i === 1 ? 'var(--color-volt)' : SET_PALETTE[(i - 2) % SET_PALETTE.length]}
                      name={`Set ${i}`}
                      value={v === null || v === undefined ? '—' : `${num(v, 1)} kg (e1RM)`}
                    />
                  )
                })}
              </ChartTooltip>
            )
          }}
        />
        {indices.map((i) => (
          <Line
            key={i}
            isAnimationActive={false}
            dataKey={String(i)}
            stroke={i === 1 ? 'var(--color-volt)' : SET_PALETTE[(i - 2) % SET_PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 2, fill: 'currentColor', strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
