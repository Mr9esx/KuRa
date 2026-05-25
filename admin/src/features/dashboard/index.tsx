import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { TopNav } from '@/components/layout/top-nav'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { analytics, type AnalyticsOverviewResponse } from '@/lib/api-client'
import { Analytics } from './components/analytics'
import { GeoHotspotMap } from './components/geo-hotspot-map'
import { Overview } from './components/overview'
import { RecentSales } from './components/recent-sales'

const EMPTY_OVERVIEW: AnalyticsOverviewResponse = {
  days: 30,
  summary: {
    events: 0,
    unique_users: 0,
    unique_visitors: 0,
    sessions: 0,
    avg_events_per_session: 0,
    last_24h_events: 0,
    last_24h_active_visitors: 0,
  },
  trend: [],
  top_pages: [],
  top_events: [],
  devices: [],
  geo_hotspots: [],
  recent_events: [],
}

export function Dashboard() {
  const [overview, setOverview] = useState<AnalyticsOverviewResponse>(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    analytics
      .overview(30)
      .then((data) => {
        if (!active) return
        setOverview({
          ...EMPTY_OVERVIEW,
          ...data,
          summary: {
            ...EMPTY_OVERVIEW.summary,
            ...(data.summary ?? {}),
          },
          trend: data.trend ?? [],
          top_pages: data.top_pages ?? [],
          top_events: data.top_events ?? [],
          devices: data.devices ?? [],
          geo_hotspots: data.geo_hotspots ?? [],
          recent_events: data.recent_events ?? [],
        })
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : '加载埋点统计失败')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const lastDateLabel = useMemo(() => {
    if (overview.trend.length === 0) return '暂无数据'
    return overview.trend[overview.trend.length - 1]?.date ?? '暂无数据'
  }, [overview.trend])

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <TopNav links={topNav} className='me-auto' />
        <Search />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      {/* ===== Main ===== */}
      <Main>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <h1 className='text-2xl font-bold tracking-tight'>数据概览</h1>
          <div className='flex items-center space-x-2'>
            <Button>导出</Button>
          </div>
        </div>
        <Tabs
          orientation='vertical'
          defaultValue='overview'
          className='space-y-4'
        >
          <div className='w-full overflow-x-auto pb-2'>
            <TabsList>
              <TabsTrigger value='overview'>总览</TabsTrigger>
              <TabsTrigger value='analytics'>分析</TabsTrigger>
              <TabsTrigger value='reports' disabled>
                报表
              </TabsTrigger>
              <TabsTrigger value='notifications' disabled>
                通知
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value='overview' className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    总事件数
                  </CardTitle>
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
                    <path d='M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' />
                  </svg>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{overview.summary.events}</div>
                  <p className='text-xs text-muted-foreground'>
                    近 24 小时 {overview.summary.last_24h_events}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    唯一用户
                  </CardTitle>
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
                    <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
                    <circle cx='9' cy='7' r='4' />
                    <path d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' />
                  </svg>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {overview.summary.unique_users}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    近 24 小时活跃访客 {overview.summary.last_24h_active_visitors}
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
                    <rect width='20' height='14' x='2' y='5' rx='2' />
                    <path d='M2 10h20' />
                  </svg>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {overview.summary.unique_visitors}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    会话数 {overview.summary.sessions}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    平均事件/会话
                  </CardTitle>
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
                    <path d='M22 12h-4l-3 9L9 3l-3 9H2' />
                  </svg>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>
                    {overview.summary.avg_events_per_session.toFixed(2)}
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {lastDateLabel}
                  </p>
                </CardContent>
              </Card>
            </div>
            {loading && (
              <p className='text-sm text-muted-foreground'>正在加载统计数据...</p>
            )}
            {error && <p className='text-sm text-destructive'>{error}</p>}
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
              <Card className='col-span-1 lg:col-span-4'>
                <CardHeader>
                  <CardTitle>趋势</CardTitle>
                </CardHeader>
                <CardContent className='ps-2'>
                  <Overview trend={overview.trend} />
                </CardContent>
              </Card>
              <Card className='col-span-1 lg:col-span-3'>
                <CardHeader>
                  <CardTitle>最近事件</CardTitle>
                  <CardDescription>
                    最新 {overview.recent_events.length} 条埋点事件
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RecentSales events={overview.recent_events} />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>地理热点</CardTitle>
                <CardDescription>按 IP 解析后的城市访问热度</CardDescription>
              </CardHeader>
              <CardContent>
                <GeoHotspotMap hotspots={overview.geo_hotspots} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value='analytics' className='space-y-4'>
            <Analytics data={overview} />
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}

const topNav = [
  {
    title: '总览',
    href: 'dashboard/overview',
    isActive: true,
    disabled: false,
  },
  {
    title: '客户',
    href: 'dashboard/customers',
    isActive: false,
    disabled: true,
  },
  {
    title: '产品',
    href: 'dashboard/products',
    isActive: false,
    disabled: true,
  },
  {
    title: '设置',
    href: 'dashboard/settings',
    isActive: false,
    disabled: true,
  },
]
