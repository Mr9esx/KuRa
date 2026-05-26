import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from '@/context/theme-provider'
import type { AnalyticsGeoHotspot } from '@/lib/api-client'

const LIGHT_TILES =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const DARK_TILES =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

function markerRadius(count: number, max: number) {
  if (max <= 0) return 5
  return 5 + (count / max) * 15
}

export function GeoHotspotMap({
  hotspots,
}: {
  hotspots: AnalyticsGeoHotspot[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const { theme } = useTheme()

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [30, 105],
      zoom: 3,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    })

    const isDark = theme === 'dark'
    const tile = L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, {
      attribution: ATTRIBUTION,
      maxZoom: 18,
    }).addTo(map)

    tileRef.current = tile
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      tileRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!tileRef.current) return
    const isDark = theme === 'dark'
    tileRef.current.setUrl(isDark ? DARK_TILES : LIGHT_TILES)
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer)
    })

    for (const item of filtered) {
      const r = markerRadius(item.count, maxCount)
      L.circleMarker([item.lat as number, item.lng as number], {
        radius: r,
        fillColor: '#3b82f6',
        fillOpacity: 0.55,
        color: '#2563eb',
        weight: 1.5,
      })
        .bindPopup(
          `<strong>${item.city}</strong><br/>${item.country} · ${item.region}<br/>访问 ${item.count} 次`
        )
        .addTo(map)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, maxCount])

  return (
    <div className='space-y-3'>
      <div
        ref={containerRef}
        className='h-[340px] w-full overflow-hidden rounded-lg border border-border'
      />

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
