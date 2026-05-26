import type { AnalyticsNamedCount } from '@/lib/api-client'

export function TopPages({ pages }: { pages: AnalyticsNamedCount[] }) {
  if (pages.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>
        暂无页面数据
      </p>
    )
  }

  const max = pages[0]?.count ?? 1

  return (
    <div className='space-y-2'>
      {pages.map((page) => (
        <div key={page.name} className='space-y-1'>
          <div className='flex items-center justify-between text-sm'>
            <span className='truncate font-medium' title={page.name}>
              {page.name || '/'}
            </span>
            <span className='ml-2 shrink-0 text-muted-foreground'>
              {page.count}
            </span>
          </div>
          <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
            <div
              className='h-full rounded-full bg-primary transition-all'
              style={{ width: `${(page.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
