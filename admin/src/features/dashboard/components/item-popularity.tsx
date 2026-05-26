import { useMemo } from 'react'
import type { ItemPopularityRow } from '@/lib/api-client'

export function ItemPopularity({ items }: { items: ItemPopularityRow[] }) {
  const sorted = useMemo(
    () => items.toSorted((a, b) => b.place_count - a.place_count),
    [items],
  )

  if (sorted.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>
        暂无物品数据
      </p>
    )
  }

  const maxPlace = sorted[0]?.place_count ?? 1

  return (
    <div className='space-y-3'>
      {sorted.map((item, i) => {
        const retained = item.place_count - item.remove_count
        const retainRate =
          item.place_count > 0
            ? Math.round((retained / item.place_count) * 100)
            : 0

        return (
          <div key={item.sku} className='space-y-1'>
            <div className='flex items-center justify-between text-sm'>
              <div className='flex items-center gap-2 min-w-0'>
                <span className='inline-flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground'>
                  {i + 1}
                </span>
                <span className='truncate font-medium' title={`${item.display_name} (${item.sku})`}>
                  {item.display_name || item.sku}
                </span>
                {item.display_name && item.display_name !== item.sku && (
                  <span className='shrink-0 text-[10px] text-muted-foreground'>
                    {item.sku}
                  </span>
                )}
              </div>
              <div className='flex items-center gap-3 text-xs text-muted-foreground'>
                <span title='选中次数'>选 {item.select_count}</span>
                <span title='放置次数'>放 {item.place_count}</span>
                <span title='保留率'>留 {retainRate}%</span>
              </div>
            </div>
            <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
              <div
                className='h-full rounded-full bg-primary transition-all'
                style={{
                  width: `${(item.place_count / maxPlace) * 100}%`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
