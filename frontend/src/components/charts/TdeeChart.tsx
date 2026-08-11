import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, TooltipRow } from '@/components/charts/ChartTooltip'
import { shortDate } from '@/lib/date'
import { num } from '@/lib/format'
import type { TdeeEstimate } from '@/types'

export function TdeeChart({
  estimates,
  height = 220,
}: {
  estimates: TdeeEstimate[]
  height?: number
}) {
  const data = estimates.map((e) => ({
    date: shortDate(e.estimate_date),
    value: Math.round(e.estimated_tdee),
    confidence: e.confidence,
  }))

  // A zero-based axis flattens the line — these numbers only ever move by a few
  // hundred kcal, and that movement is the whole point of the chart.
  const values = data.map((d) => d.value)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const pad = Math.max(120, Math.round((max - min) * 0.35))
  const domain: [number, number] = [
    Math.floor((min - pad) / 100) * 100,
    Math.ceil((max + pad) / 100) * 100,
  ]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="tdeeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-volt)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-volt)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          domain={domain}
          allowDecimals={false}
          tickFormatter={(v: number) => `${Math.round(v)}`}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as (typeof data)[number]
            return (
              <ChartTooltip label={label}>
                <TooltipRow
                  color="var(--color-volt)"
                  name="Estimated TDEE"
                  value={`${num(p.value)} kcal`}
                />
                <p className="mt-0.5 text-[11.5px] text-ink-faint">{p.confidence} confidence</p>
              </ChartTooltip>
            )
          }}
        />
        <Area
          isAnimationActive={false}
          type="monotone"
          dataKey="value"
          stroke="var(--color-volt)"
          strokeWidth={2}
          fill="url(#tdeeFill)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
