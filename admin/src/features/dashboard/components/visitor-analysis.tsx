import type { AnalyticsVisitorsResponse } from '@/lib/api-client'

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  if (minutes < 60) return `${minutes}分${remaining > 0 ? `${remaining}秒` : ''}`
  const hours = Math.floor(minutes / 60)
  return `${hours}时${minutes % 60}分`
}

const TIER_COLORS: Record<string, string> = {
  '仅浏览': '#cbd5e1',
  '轻度互动': '#94a3b8',
  '中度互动': '#64748b',
  '深度互动': '#475569',
}

export function NewVsReturningChart({
  data,
}: {
  data: AnalyticsVisitorsResponse['new_vs_returning']
}) {
  const total = data.new_visitors + data.returning_visitors
  if (total === 0) {
    return (
      <p className='py-8 text-center text-sm text-muted-foreground'>暂无数据</p>
    )
  }

  const newPct = Math.round((data.new_visitors / total) * 100)
  const retPct = 100 - newPct

  return (
    <div className='flex items-center gap-6'>
      <div className='relative h-32 w-32 shrink-0'>
        <svg viewBox='0 0 36 36' className='h-full w-full -rotate-90'>
          <circle
            cx='18'
            cy='18'
            r='15.5'
            fill='none'
            stroke='#cbd5e1'
            strokeWidth='3.5'
          />
          <circle
            cx='18'
            cy='18'
            r='15.5'
            fill='none'
            stroke='#475569'
            strokeWidth='3.5'
            strokeDasharray={`${retPct} ${100 - retPct}`}
            strokeDashoffset='0'
            strokeLinecap='round'
          />
        </svg>
        <div className='absolute inset-0 flex flex-col items-center justify-center'>
          <span className='text-xl font-bold'>{total}</span>
          <span className='text-[10px] text-muted-foreground'>访客</span>
        </div>
      </div>
      <div className='flex-1 space-y-3'>
        <div className='flex items-center gap-2'>
          <div className='h-3 w-3 rounded-full bg-[#cbd5e1]' />
          <span className='flex-1 text-sm'>新访客</span>
          <span className='text-sm font-medium tabular-nums'>
            {data.new_visitors}
          </span>
          <span className='w-10 text-right text-xs text-muted-foreground'>
            {newPct}%
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <div className='h-3 w-3 rounded-full bg-[#475569]' />
          <span className='flex-1 text-sm'>回访访客</span>
          <span className='text-sm font-medium tabular-nums'>
            {data.returning_visitors}
          </span>
          <span className='w-10 text-right text-xs text-muted-foreground'>
            {retPct}%
          </span>
        </div>
      </div>
    </div>
  )
}

export function EngagementDistribution({
  tiers,
}: {
  tiers: AnalyticsVisitorsResponse['engagement']
}) {
  if (tiers.length === 0) {
    return (
      <p className='py-8 text-center text-sm text-muted-foreground'>暂无数据</p>
    )
  }

  const total = tiers.reduce((s, t) => s + t.count, 0) || 1

  return (
    <div className='space-y-3'>
      {tiers.map((tier) => {
        const pct = Math.round((tier.count / total) * 100)
        const color = TIER_COLORS[tier.tier] ?? '#94a3b8'
        return (
          <div key={tier.tier}>
            <div className='mb-1 flex items-center justify-between text-xs'>
              <span className='text-muted-foreground'>{tier.tier}</span>
              <span className='font-medium tabular-nums'>
                {tier.count}{' '}
                <span className='text-muted-foreground'>({pct}%)</span>
              </span>
            </div>
            <div className='h-2.5 w-full rounded-full bg-muted'>
              <div
                className='h-2.5 rounded-full transition-all'
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TopVisitorsTable({
  visitors,
}: {
  visitors: AnalyticsVisitorsResponse['top_visitors']
}) {
  if (visitors.length === 0) {
    return (
      <p className='py-8 text-center text-sm text-muted-foreground'>暂无数据</p>
    )
  }

  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-xs'>
        <thead>
          <tr className='border-b text-muted-foreground'>
            <th className='pb-2 pr-4 text-left font-medium'>访客 ID</th>
            <th className='pb-2 px-2 text-right font-medium'>会话</th>
            <th className='pb-2 px-2 text-right font-medium'>操作</th>
            <th className='pb-2 px-2 text-right font-medium'>导出</th>
            <th className='pb-2 px-2 text-right font-medium'>导入</th>
            <th className='pb-2 px-2 text-right font-medium'>应用方案</th>
            <th className='pb-2 px-2 text-right font-medium'>平均时长</th>
            <th className='pb-2 px-2 text-left font-medium'>设备</th>
            <th className='pb-2 pl-2 text-left font-medium'>城市</th>
          </tr>
        </thead>
        <tbody>
          {visitors.map((v) => (
            <tr key={v.visitor_id} className='border-b last:border-0'>
              <td className='py-2 pr-4 font-mono'>
                {v.visitor_id.slice(0, 8)}…
              </td>
              <td className='py-2 px-2 text-right tabular-nums'>{v.sessions}</td>
              <td className='py-2 px-2 text-right tabular-nums'>{v.actions}</td>
              <td className='py-2 px-2 text-right tabular-nums'>{v.exports}</td>
              <td className='py-2 px-2 text-right tabular-nums'>{v.imports}</td>
              <td className='py-2 px-2 text-right tabular-nums'>{v.presets}</td>
              <td className='py-2 px-2 text-right tabular-nums whitespace-nowrap'>
                {formatDuration(v.avg_duration_ms)}
              </td>
              <td className='py-2 px-2 text-left'>{v.device_type || '—'}</td>
              <td className='py-2 pl-2 text-left'>{v.city || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SessionDurationCard({
  avgSession,
}: {
  avgSession: AnalyticsVisitorsResponse['avg_session']
}) {
  return (
    <div className='flex items-center gap-6'>
      <div className='flex-1 text-center'>
        <div className='text-2xl font-bold'>
          {formatDuration(avgSession.visible_ms)}
        </div>
        <div className='mt-1 text-xs text-muted-foreground'>
          平均活跃时长
        </div>
      </div>
      <div className='h-10 w-px bg-border' />
      <div className='flex-1 text-center'>
        <div className='text-2xl font-bold'>
          {formatDuration(avgSession.total_ms)}
        </div>
        <div className='mt-1 text-xs text-muted-foreground'>
          平均总停留
        </div>
      </div>
    </div>
  )
}
