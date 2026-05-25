import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { AnalyticsTrendPoint } from '@/lib/api-client'

function toAxisName(date: string) {
  return date.slice(5)
}

export function Overview({ trend }: { trend: AnalyticsTrendPoint[] }) {
  const data = trend.map((item) => ({
    name: toAxisName(item.date),
    total: item.events,
  }))
  return (
    <ResponsiveContainer width='100%' height={350}>
      <BarChart data={data}>
        <XAxis
          dataKey='name'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          direction='ltr'
          stroke='#888888'
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <Bar
          dataKey='total'
          fill='currentColor'
          radius={[4, 4, 0, 0]}
          className='fill-primary'
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
