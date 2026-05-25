import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { AnalyticsTrendPoint } from '@/lib/api-client'

function toAxisName(date: string) {
  return date.slice(5)
}

export function AnalyticsChart({ trend }: { trend: AnalyticsTrendPoint[] }) {
  const data = trend.map((item) => ({
    name: toAxisName(item.date),
    clicks: item.events,
    uniques: item.visitors,
  }))

  return (
    <ResponsiveContainer width='100%' height={300}>
      <AreaChart data={data}>
        <XAxis
          dataKey='name'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Area
          type='monotone'
          dataKey='clicks'
          stroke='currentColor'
          className='text-primary'
          fill='currentColor'
          fillOpacity={0.15}
        />
        <Area
          type='monotone'
          dataKey='uniques'
          stroke='currentColor'
          className='text-muted-foreground'
          fill='currentColor'
          fillOpacity={0.1}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
