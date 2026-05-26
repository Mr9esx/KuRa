import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsTrendPoint } from '@/lib/api-client'

function toAxisName(date: string) {
  return date.slice(5)
}

export function AnalyticsChart({ trend }: { trend: AnalyticsTrendPoint[] }) {
  const data = trend.map((item) => ({
    name: toAxisName(item.date),
    事件: item.events,
    访客: item.visitors,
    会话: item.sessions,
  }))

  return (
    <ResponsiveContainer width='100%' height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray='3 3' opacity={0.15} />
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
        <Tooltip />
        <Legend />
        <Area
          type='monotone'
          dataKey='事件'
          stroke='#3b82f6'
          fill='#3b82f6'
          fillOpacity={0.15}
        />
        <Area
          type='monotone'
          dataKey='访客'
          stroke='#10b981'
          fill='#10b981'
          fillOpacity={0.1}
        />
        <Area
          type='monotone'
          dataKey='会话'
          stroke='#f59e0b'
          fill='#f59e0b'
          fillOpacity={0.08}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
