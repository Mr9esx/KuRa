import type { AnalyticsGeoHotspot } from '@/lib/api-client'

function getMarkerSize(count: number, max: number) {
  if (max <= 0) return 3
  const ratio = count / max
  return 3 + ratio * 9
}

function projectToMap(lat: number, lng: number) {
  const x = ((lng + 180) / 360) * 1000
  const y = ((90 - lat) / 180) * 500
  return { x, y }
}

export function GeoHotspotMap({ hotspots }: { hotspots: AnalyticsGeoHotspot[] }) {
  const filtered = hotspots.filter(
    (item) =>
      typeof item.lat === 'number' &&
      typeof item.lng === 'number' &&
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lng)
  )

  const maxCount = filtered.reduce((max, item) => Math.max(max, item.count), 0)

  return (
    <div className='space-y-3'>
      <div className='h-[300px] w-full overflow-hidden rounded-lg border border-border bg-muted/20'>
        <svg viewBox='0 0 1000 500' className='h-full w-full'>
          <rect x='0' y='0' width='1000' height='500' fill='hsl(var(--muted))' />
          {Array.from({ length: 11 }).map((_, i) => {
            const x = i * 100
            return (
              <line
                key={`v-${x}`}
                x1={x}
                y1={0}
                x2={x}
                y2={500}
                stroke='hsl(var(--border))'
                strokeWidth='1'
                opacity='0.45'
              />
            )
          })}
          {Array.from({ length: 6 }).map((_, i) => {
            const y = i * 100
            return (
              <line
                key={`h-${y}`}
                x1={0}
                y1={y}
                x2={1000}
                y2={y}
                stroke='hsl(var(--border))'
                strokeWidth='1'
                opacity='0.45'
              />
            )
          })}

          {filtered.map((item) => {
            const { x, y } = projectToMap(item.lat as number, item.lng as number)
            return (
              <circle
                key={`${item.city}-${item.lat}-${item.lng}`}
                cx={x}
                cy={y}
                r={getMarkerSize(item.count, maxCount)}
                fill='hsl(var(--primary))'
                fillOpacity='0.6'
                stroke='hsl(var(--primary))'
                strokeWidth='1.2'
              />
            )
          })}
        </svg>
      </div>

      {filtered.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          暂无地理热点数据。先产生几条埋点数据后，这里会显示城市热点。
        </p>
      ) : (
        <div className='space-y-1'>
          {filtered.slice(0, 8).map((item) => (
            <div
              key={`${item.city}-${item.lat}-${item.lng}-list`}
              className='flex items-center justify-between text-xs'
            >
              <span className='text-muted-foreground'>
                {item.country} / {item.region} / {item.city}
              </span>
              <span className='font-medium'>{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
