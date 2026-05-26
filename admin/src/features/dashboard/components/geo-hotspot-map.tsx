import {
  Map,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
  MapControls,
  MapHeatmap,
  wgs84ToGcj02,
  type HeatmapPoint,
} from 'amapcn'
import type { AnalyticsGeoHotspot } from '@/lib/api-client'

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY as string | undefined

export function GeoHotspotMap({
  hotspots,
}: {
  hotspots: AnalyticsGeoHotspot[]
}) {
  const filtered = hotspots.filter(
    (item) =>
      typeof item.lat === 'number' &&
      typeof item.lng === 'number' &&
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lng)
  )

  const maxCount = filtered.reduce(
    (max, item) => Math.max(max, item.count),
    0
  )

  const heatmapData: HeatmapPoint[] = filtered.map((item) => {
    const [lng, lat] = wgs84ToGcj02(item.lng as number, item.lat as number)
    return { lng, lat, count: item.count }
  })

  const markerSize = (count: number) => {
    if (maxCount <= 0) return 10
    return 10 + (count / maxCount) * 20
  }

  return (
    <div className='space-y-3'>
      <div className='h-[340px] w-full overflow-hidden rounded-lg border border-border'>
        <Map
          amapKey={AMAP_KEY}
          center={[105, 30]}
          zoom={4}
          className='h-full w-full'
        >
          <MapControls
            position='top-right'
            showZoom
            showCompass={false}
            showLocate={false}
            showFullscreen={false}
          />

          {filtered.length > 5 ? (
            <MapHeatmap
              data={heatmapData}
              radius={25}
              opacity={0.7}
              max={maxCount}
              gradient={{
                '0.4': '#3b82f6',
                '0.65': '#8b5cf6',
                '0.85': '#ef4444',
                '1.0': '#f97316',
              }}
            />
          ) : null}

          {filtered.map((item) => {
            const [lng, lat] = wgs84ToGcj02(
              item.lng as number,
              item.lat as number
            )
            const size = markerSize(item.count)
            return (
              <MapMarker
                key={`${item.city}-${item.lat}-${item.lng}`}
                longitude={lng}
                latitude={lat}
              >
                <MarkerContent>
                  <div
                    className='rounded-full border-2 border-white bg-blue-500 shadow-md'
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      opacity: 0.75,
                    }}
                  />
                </MarkerContent>
                <MarkerTooltip>
                  <div className='text-xs'>
                    <strong>{item.city}</strong>
                    <br />
                    {item.country} · {item.region}
                    <br />
                    访问 {item.count} 次
                  </div>
                </MarkerTooltip>
              </MapMarker>
            )
          })}
        </Map>
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
