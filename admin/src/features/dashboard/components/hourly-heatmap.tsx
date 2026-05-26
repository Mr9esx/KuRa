import { useMemo } from 'react'
import type { HeatmapCell } from '@/lib/api-client'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i)

function interpolateColor(ratio: number): string {
  if (ratio === 0) return 'var(--color-muted)'
  const r = Math.round(59 + (239 - 59) * ratio)
  const g = Math.round(130 + (68 - 130) * ratio)
  const b = Math.round(246 + (68 - 246) * ratio)
  return `rgb(${r}, ${g}, ${b})`
}

export function HourlyHeatmap({ data }: { data: HeatmapCell[] }) {
  const { grid, max } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    let m = 0
    for (const cell of data) {
      g[cell.weekday][cell.hour] = cell.sessions
      if (cell.sessions > m) m = cell.sessions
    }
    return { grid: g, max: m }
  }, [data])

  if (data.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>
        暂无活跃数据
      </p>
    )
  }

  return (
    <div className='overflow-x-auto'>
      <div className='min-w-[600px]'>
        {/* Hour labels */}
        <div className='mb-1 flex'>
          <div className='w-8 shrink-0' />
          {HOUR_LABELS.map((h) => (
            <div
              key={h}
              className='flex-1 text-center text-[10px] text-muted-foreground'
            >
              {h % 3 === 0 ? `${h}` : ''}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {grid.map((row, weekday) => (
          <div key={weekday} className='flex items-center gap-0.5'>
            <div className='w-8 shrink-0 text-right text-xs text-muted-foreground'>
              {WEEKDAY_LABELS[weekday]}
            </div>
            {row.map((sessions, hour) => {
              const ratio = max > 0 ? sessions / max : 0
              return (
                <div
                  key={hour}
                  className='flex-1 aspect-square rounded-sm transition-colors'
                  style={{ backgroundColor: interpolateColor(ratio) }}
                  title={`周${WEEKDAY_LABELS[weekday]} ${hour}:00 — ${sessions} 会话`}
                />
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className='mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground'>
          <span>少</span>
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <div
              key={r}
              className='size-3 rounded-sm'
              style={{ backgroundColor: interpolateColor(r) }}
            />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  )
}
