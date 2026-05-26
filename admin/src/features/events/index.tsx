import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  analytics,
  type AnalyticsEventItem,
} from '@/lib/api-client'

const PAGE_SIZE = 20

export function Events() {
  const [events, setEvents] = useState<AnalyticsEventItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [eventFilter, setEventFilter] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('')

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await analytics.listEvents({
        page,
        limit: PAGE_SIZE,
        event_name: eventFilter || undefined,
        device_type: deviceFilter || undefined,
      })
      setEvents(data.events ?? [])
      setTotal(data.total)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [page, eventFilter, deviceFilter])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <Header>
        <div className='me-auto' />
        <ThemeSwitch />
      </Header>

      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>事件日志</h1>
          <p className='text-sm text-muted-foreground'>
            全部埋点事件列表，共 {total} 条
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <CardTitle>事件列表</CardTitle>
                <CardDescription>按时间倒序</CardDescription>
              </div>
              <div className='flex gap-2'>
                <Select
                  value={eventFilter}
                  onValueChange={(v) => {
                    setEventFilter(v === 'all' ? '' : v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className='w-[140px]'>
                    <SelectValue placeholder='事件类型' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>全部事件</SelectItem>
                    <SelectItem value='page_view'>page_view</SelectItem>
                    <SelectItem value='click'>click</SelectItem>
                    <SelectItem value='scroll'>scroll</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={deviceFilter}
                  onValueChange={(v) => {
                    setDeviceFilter(v === 'all' ? '' : v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className='w-[140px]'>
                    <SelectValue placeholder='设备类型' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>全部设备</SelectItem>
                    <SelectItem value='desktop'>desktop</SelectItem>
                    <SelectItem value='mobile'>mobile</SelectItem>
                    <SelectItem value='tablet'>tablet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                加载中...
              </p>
            ) : events.length === 0 ? (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                暂无事件数据
              </p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b text-left text-xs text-muted-foreground'>
                      <th className='pb-2 pr-4 font-medium'>时间</th>
                      <th className='pb-2 pr-4 font-medium'>事件</th>
                      <th className='pb-2 pr-4 font-medium'>页面</th>
                      <th className='pb-2 pr-4 font-medium'>设备</th>
                      <th className='pb-2 pr-4 font-medium'>城市</th>
                      <th className='pb-2 font-medium'>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr
                        key={ev.id}
                        className='border-b last:border-0 hover:bg-muted/50'
                      >
                        <td className='whitespace-nowrap py-2.5 pr-4'>
                          {new Date(ev.occurred_at).toLocaleString()}
                        </td>
                        <td className='py-2.5 pr-4'>
                          <span className='rounded bg-muted px-1.5 py-0.5 font-mono text-xs'>
                            {ev.event_name}
                          </span>
                        </td>
                        <td
                          className='max-w-[180px] truncate py-2.5 pr-4'
                          title={ev.page_path}
                        >
                          {ev.page_path || '-'}
                        </td>
                        <td className='py-2.5 pr-4'>
                          {ev.device_type || '-'}
                        </td>
                        <td className='py-2.5 pr-4'>
                          {ev.city || '未知'}
                        </td>
                        <td className='py-2.5 font-mono text-xs text-muted-foreground'>
                          {ev.ip}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className='mt-4 flex items-center justify-between'>
                <p className='text-xs text-muted-foreground'>
                  第 {page}/{totalPages} 页
                </p>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    上一页
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
