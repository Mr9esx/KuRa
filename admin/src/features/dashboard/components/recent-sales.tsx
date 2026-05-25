import type { AnalyticsRecentEvent } from '@/lib/api-client'

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function RecentSales({ events }: { events: AnalyticsRecentEvent[] }) {
  return (
    <div className='space-y-8'>
      {events.length === 0 ? (
        <p className='text-sm text-muted-foreground'>暂无事件数据。</p>
      ) : (
        events.map((event) => (
          <div key={event.id} className='flex items-start justify-between gap-3'>
            <div className='space-y-1'>
              <p className='text-sm leading-none font-medium'>{event.event_name}</p>
              <p className='text-sm text-muted-foreground'>
                {event.page_path || '/'} · {event.device_type || 'unknown'} ·{' '}
                {event.city || '未知城市'}
              </p>
            </div>
            <div className='text-xs text-muted-foreground'>
              {event.ip || '-'} · {formatTime(event.occurred_at)}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
