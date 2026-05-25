import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { AnalyticsOverviewResponse } from '@/lib/api-client'
import { AnalyticsChart } from './analytics-chart'
import { GeoHotspotMap } from './geo-hotspot-map'

export function Analytics({ data }: { data: AnalyticsOverviewResponse }) {
  const totalEvents = data.summary.events
  const uniqueUsers = data.summary.unique_users
  const uniqueVisitors = data.summary.unique_visitors
  const sessions = data.summary.sessions
  const avgEventsPerSession = data.summary.avg_events_per_session.toFixed(2)

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>流量趋势</CardTitle>
          <CardDescription>
            最近 {data.days} 天事件量与访客趋势
          </CardDescription>
        </CardHeader>
        <CardContent className='px-6'>
          <AnalyticsChart trend={data.trend} />
        </CardContent>
      </Card>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>总事件数</CardTitle>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              className='h-4 w-4 text-muted-foreground'
            >
              <path d='M3 3v18h18' />
              <path d='M7 15l4-4 4 4 4-6' />
            </svg>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalEvents}</div>
            <p className='text-xs text-muted-foreground'>
              近 24 小时 {data.summary.last_24h_events}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>唯一用户</CardTitle>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              className='h-4 w-4 text-muted-foreground'
            >
              <circle cx='12' cy='7' r='4' />
              <path d='M6 21v-2a6 6 0 0 1 12 0v2' />
            </svg>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{uniqueUsers}</div>
            <p className='text-xs text-muted-foreground'>
              近 24 小时活跃访客 {data.summary.last_24h_active_visitors}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>唯一访客</CardTitle>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              className='h-4 w-4 text-muted-foreground'
            >
              <path d='M3 12h6l3 6 3-6h6' />
            </svg>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{uniqueVisitors}</div>
            <p className='text-xs text-muted-foreground'>会话数 {sessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>平均事件/会话</CardTitle>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              className='h-4 w-4 text-muted-foreground'
            >
              <circle cx='12' cy='12' r='10' />
              <path d='M12 6v6l4 2' />
            </svg>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{avgEventsPerSession}</div>
            <p className='text-xs text-muted-foreground'>会话行为活跃度</p>
          </CardContent>
        </Card>
      </div>
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
        <Card className='col-span-1 lg:col-span-4'>
          <CardHeader>
            <CardTitle>热门事件</CardTitle>
            <CardDescription>触发次数最多的行为</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarList
              items={data.top_events.map((item) => ({
                name: item.name,
                value: item.count,
              }))}
              barClass='bg-primary'
              valueFormatter={(n) => `${n}`}
            />
          </CardContent>
        </Card>
        <Card className='col-span-1 lg:col-span-3'>
          <CardHeader>
            <CardTitle>设备分布</CardTitle>
            <CardDescription>不同设备上的访问情况</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarList
              items={data.devices.map((item) => ({
                name: item.name,
                value: item.count,
              }))}
              barClass='bg-muted-foreground'
              valueFormatter={(n) => `${n}`}
            />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>地理热点</CardTitle>
          <CardDescription>按 IP 解析后的城市访问热度</CardDescription>
        </CardHeader>
        <CardContent>
          <GeoHotspotMap hotspots={data.geo_hotspots ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}

function SimpleBarList({
  items,
  valueFormatter,
  barClass,
}: {
  items: { name: string; value: number }[]
  valueFormatter: (n: number) => string
  barClass: string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className='space-y-3'>
      {items.map((i) => {
        const width = `${Math.round((i.value / max) * 100)}%`
        return (
          <li key={i.name} className='flex items-center justify-between gap-3'>
            <div className='min-w-0 flex-1'>
              <div className='mb-1 truncate text-xs text-muted-foreground'>
                {i.name}
              </div>
              <div className='h-2.5 w-full rounded-full bg-muted'>
                <div
                  className={`h-2.5 rounded-full ${barClass}`}
                  style={{ width }}
                />
              </div>
            </div>
            <div className='ps-2 text-xs font-medium tabular-nums'>
              {valueFormatter(i.value)}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
