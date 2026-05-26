import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  Box,
  Eye,
  FolderTree,
  Layers,
  MousePointerClick,
  Users,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  analytics,
  stats,
  type AnalyticsOverviewResponse,
  type AnalyticsInsightsResponse,
  type AnalyticsVisitorsResponse,
  type StatsOverview,
} from '@/lib/api-client'
import { AnalyticsChart } from './components/analytics-chart'
import { GeoHotspotMap } from './components/geo-hotspot-map'
import { RecentSales } from './components/recent-sales'
import { TopPages } from './components/top-pages'
import { HourlyHeatmap } from './components/hourly-heatmap'
import { ItemPopularity } from './components/item-popularity'
import { FunnelChart } from './components/funnel-chart'
import {
  NewVsReturningChart,
  EngagementDistribution,
  TopVisitorsTable,
  SessionDurationCard,
} from './components/visitor-analysis'

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

const EMPTY_INSIGHTS: AnalyticsInsightsResponse = {
  days: 30,
  hourly_heatmap: [],
  item_popularity: [],
  funnel: { page_views: 0, item_selects: 0, item_places: 0, exports: 0 },
}

const EMPTY_VISITORS: AnalyticsVisitorsResponse = {
  days: 30,
  new_vs_returning: { new_visitors: 0, returning_visitors: 0 },
  engagement: [],
  top_visitors: [],
  avg_session: { visible_ms: 0, total_ms: 0 },
  browsers: [],
  oses: [],
}

const EMPTY_STATS: StatsOverview = {
  products: {
    total: 0,
    blocks: 0,
    items: 0,
    risers: 0,
    published: 0,
    unpublished: 0,
  },
  categories: { total: 0, block_categories: 0, item_categories: 0 },
  presets: { total: 0, published: 0, unpublished: 0 },
}

export function Dashboard() {
  const [overview, setOverview] =
    useState<AnalyticsOverviewResponse>(EMPTY_OVERVIEW)
  const [insights, setInsights] =
    useState<AnalyticsInsightsResponse>(EMPTY_INSIGHTS)
  const [visitors, setVisitors] =
    useState<AnalyticsVisitorsResponse>(EMPTY_VISITORS)
  const [bizStats, setBizStats] = useState<StatsOverview>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const analyticsPromise = analytics.overview(30)
    const insightsPromise = analytics.insights(30)
    const visitorsPromise = analytics.visitors(30)
    const statsPromise = stats.overview()

    Promise.all([analyticsPromise, insightsPromise, visitorsPromise, statsPromise])
      .then(([analyticsData, insightsData, visitorsData, statsData]) => {
        if (!active) return
        setOverview({
          ...EMPTY_OVERVIEW,
          ...analyticsData,
          summary: { ...EMPTY_OVERVIEW.summary, ...(analyticsData.summary ?? {}) },
          trend: analyticsData.trend ?? [],
          top_pages: analyticsData.top_pages ?? [],
          top_events: analyticsData.top_events ?? [],
          devices: analyticsData.devices ?? [],
          geo_hotspots: analyticsData.geo_hotspots ?? [],
          recent_events: analyticsData.recent_events ?? [],
        })
        setInsights({
          ...EMPTY_INSIGHTS,
          ...insightsData,
          hourly_heatmap: insightsData.hourly_heatmap ?? [],
          item_popularity: insightsData.item_popularity ?? [],
          funnel: { ...EMPTY_INSIGHTS.funnel, ...(insightsData.funnel ?? {}) },
        })
        setVisitors({
          ...EMPTY_VISITORS,
          ...visitorsData,
          new_vs_returning: { ...EMPTY_VISITORS.new_vs_returning, ...(visitorsData.new_vs_returning ?? {}) },
          engagement: visitorsData.engagement ?? [],
          top_visitors: visitorsData.top_visitors ?? [],
          avg_session: { ...EMPTY_VISITORS.avg_session, ...(visitorsData.avg_session ?? {}) },
          browsers: visitorsData.browsers ?? [],
          oses: visitorsData.oses ?? [],
        })
        setBizStats({ ...EMPTY_STATS, ...statsData })
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : '加载数据失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <Header>
        <div className='me-auto' />
        <ThemeSwitch />
      </Header>

      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>数据概览</h1>
          <p className='text-sm text-muted-foreground'>
            业务数据与用户行为分析
          </p>
        </div>

        {loading && (
          <p className='text-sm text-muted-foreground'>正在加载...</p>
        )}
        {error && <p className='text-sm text-destructive'>{error}</p>}

        {/* 1. 业务数据卡片 */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <StatCard
            icon={<Box className='h-4 w-4' />}
            title='产品总数'
            value={bizStats.products.total}
            desc={`框体 ${bizStats.products.blocks} · 物件 ${bizStats.products.items} · 增高件 ${bizStats.products.risers}`}
          />
          <StatCard
            icon={<FolderTree className='h-4 w-4' />}
            title='分类总数'
            value={bizStats.categories.total}
            desc={`框体分类 ${bizStats.categories.block_categories} · 物件分类 ${bizStats.categories.item_categories}`}
          />
          <StatCard
            icon={<Layers className='h-4 w-4' />}
            title='预设方案'
            value={bizStats.presets.total}
            desc={`已发布 ${bizStats.presets.published} · 未发布 ${bizStats.presets.unpublished}`}
          />
        </div>

        {/* 2. 埋点概要卡片 */}
        <div className='mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <StatCard
            icon={<MousePointerClick className='h-4 w-4' />}
            title='总事件数'
            value={overview.summary.events}
            desc={`近 24 小时 ${overview.summary.last_24h_events}`}
          />
          <StatCard
            icon={<Eye className='h-4 w-4' />}
            title='独立访客'
            value={overview.summary.unique_visitors}
            desc={`会话数 ${overview.summary.sessions}`}
          />
          <StatCard
            icon={<Users className='h-4 w-4' />}
            title='24h 活跃访客'
            value={overview.summary.last_24h_active_visitors}
            desc='最近 24 小时内有行为的独立访客'
          />
          <StatCard
            icon={<Activity className='h-4 w-4' />}
            title='平均事件/会话'
            value={overview.summary.avg_events_per_session.toFixed(2)}
            desc='会话行为活跃度'
          />
        </div>

        {/* 3. 趋势图 */}
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>流量趋势</CardTitle>
            <CardDescription>
              最近 {overview.days} 天事件量 · 访客 · 会话
            </CardDescription>
          </CardHeader>
          <CardContent className='ps-2'>
            <AnalyticsChart trend={overview.trend} />
          </CardContent>
        </Card>

        {/* 4. 行为洞察：漏斗 + 热力图 */}
        <div className='mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>操作漏斗</CardTitle>
              <CardDescription>
                最近 {insights.days} 天 · 各阶段独立会话数
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FunnelChart data={insights.funnel} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>时段活跃热力图</CardTitle>
              <CardDescription>
                最近 {insights.days} 天 · 按星期和小时的会话分布
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HourlyHeatmap data={insights.hourly_heatmap} />
            </CardContent>
          </Card>
        </div>

        {/* 访客分析 */}
        <div className='mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3'>
          <Card>
            <CardHeader>
              <CardTitle>新老访客</CardTitle>
              <CardDescription>
                最近 {visitors.days} 天 · 按会话数区分
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NewVsReturningChart data={visitors.new_vs_returning} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>访客参与度</CardTitle>
              <CardDescription>
                最近 {visitors.days} 天 · 按交互行为分层
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EngagementDistribution tiers={visitors.engagement} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>会话时长</CardTitle>
              <CardDescription>
                最近 {visitors.days} 天 · 平均可见时长 vs 总停留
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SessionDurationCard avgSession={visitors.avg_session} />
            </CardContent>
          </Card>
        </div>

        {/* 浏览器 & 系统分布 */}
        <div className='mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>浏览器分布</CardTitle>
              <CardDescription>按独立访客统计</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleBarList
                items={visitors.browsers.map((b) => ({
                  name: b.name,
                  value: b.count,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>操作系统分布</CardTitle>
              <CardDescription>按独立访客统计</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleBarList
                items={visitors.oses.map((o) => ({
                  name: o.name,
                  value: o.count,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* TOP 访客 */}
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>活跃访客 TOP 20</CardTitle>
            <CardDescription>
              最近 {visitors.days} 天 · 按操作数排序
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TopVisitorsTable visitors={visitors.top_visitors} />
          </CardContent>
        </Card>

        {/* 5. 物品热点 */}
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>物品热点</CardTitle>
            <CardDescription>
              最近 {insights.days} 天 · 选中 / 放置 / 保留率 TOP 20
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ItemPopularity items={insights.item_popularity} />
          </CardContent>
        </Card>

        {/* 6. 三列并排 */}
        <div className='mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3'>
          <Card>
            <CardHeader>
              <CardTitle>热门页面</CardTitle>
            </CardHeader>
            <CardContent>
              <TopPages pages={overview.top_pages} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>热门事件</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarList
                items={overview.top_events.map((item) => ({
                  name: item.name,
                  value: item.count,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>设备分布</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarList
                items={overview.devices.map((item) => ({
                  name: item.name,
                  value: item.count,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* 5. 地理热点 */}
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>地理热点</CardTitle>
            <CardDescription>按 IP 解析后的城市访问热度</CardDescription>
          </CardHeader>
          <CardContent>
            <GeoHotspotMap hotspots={overview.geo_hotspots} />
          </CardContent>
        </Card>

        {/* 6. 最近事件 */}
        <Card className='mt-4'>
          <CardHeader className='flex flex-row items-center justify-between'>
            <div>
              <CardTitle>最近事件</CardTitle>
              <CardDescription>
                最新 {overview.recent_events.length} 条埋点事件
              </CardDescription>
            </div>
            <Link
              to='/events'
              className='text-sm text-primary hover:underline'
            >
              查看全部
            </Link>
          </CardHeader>
          <CardContent>
            <RecentSales events={overview.recent_events} />
          </CardContent>
        </Card>
      </Main>
    </>
  )
}

function StatCard({
  icon,
  title,
  value,
  desc,
}: {
  icon: React.ReactNode
  title: string
  value: number | string
  desc: string
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <span className='text-muted-foreground'>{icon}</span>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        <p className='text-xs text-muted-foreground'>{desc}</p>
      </CardContent>
    </Card>
  )
}

function SimpleBarList({
  items,
}: {
  items: { name: string; value: number }[]
}) {
  if (items.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>暂无数据</p>
    )
  }

  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className='space-y-3'>
      {items.map((i) => {
        const width = `${Math.round((i.value / max) * 100)}%`
        return (
          <li
            key={i.name}
            className='flex items-center justify-between gap-3'
          >
            <div className='min-w-0 flex-1'>
              <div className='mb-1 truncate text-xs text-muted-foreground'>
                {i.name}
              </div>
              <div className='h-2 w-full rounded-full bg-muted'>
                <div
                  className='h-2 rounded-full bg-primary'
                  style={{ width }}
                />
              </div>
            </div>
            <div className='ps-2 text-xs font-medium tabular-nums'>
              {i.value}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
