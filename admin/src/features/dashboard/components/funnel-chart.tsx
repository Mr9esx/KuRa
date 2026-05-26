import { useMemo } from 'react'
import {
  FunnelChart as RechartsFunnelChart,
  Funnel,
  Tooltip,
  LabelList,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import type { FunnelData } from '@/lib/api-client'

const STAGES: { key: keyof FunnelData; label: string; color: string }[] = [
  { key: 'page_views', label: '访问', color: '#94a3b8' },
  { key: 'item_selects', label: '选中物品', color: '#78716c' },
  { key: 'item_places', label: '放置物品', color: '#64748b' },
  { key: 'exports', label: '导出方案', color: '#475569' },
]

function formatTooltip(value: number, _name: string, entry: { payload?: { label?: string; rate?: string } }) {
  const label = entry?.payload?.label ?? ''
  const rate = entry?.payload?.rate ?? ''
  return [`${value} 会话${rate ? ` (${rate})` : ''}`, label]
}

export function FunnelChart({ data }: { data: FunnelData }) {
  const first = data.page_views || 1

  const chartData = useMemo(
    () =>
      STAGES.map((stage, i) => {
        const value = data[stage.key]
        const prevValue = i > 0 ? data[STAGES[i - 1].key] : 0
        const conversionRate =
          i > 0 && prevValue > 0
            ? `${((value / prevValue) * 100).toFixed(1)}%`
            : ''
        const overallRate = `${((value / first) * 100).toFixed(0)}%`

        return {
          label: stage.label,
          value,
          fill: stage.color,
          rate: i === 0 ? '100%' : `${overallRate}`,
          stepRate: conversionRate,
        }
      }),
    [data, first],
  )

  if (first <= 0) {
    return (
      <p className='py-8 text-center text-sm text-muted-foreground'>暂无数据</p>
    )
  }

  return (
    <div>
      <ResponsiveContainer width='100%' height={220}>
        <RechartsFunnelChart>
          <Tooltip formatter={formatTooltip} />
          <Funnel dataKey='value' data={chartData} isAnimationActive>
            {chartData.map((entry) => (
              <Cell key={entry.label} fill={entry.fill} />
            ))}
            <LabelList
              position='right'
              fill='currentColor'
              stroke='none'
              dataKey='label'
              className='text-xs fill-foreground'
            />
          </Funnel>
        </RechartsFunnelChart>
      </ResponsiveContainer>

      {/* Conversion rates between stages */}
      <div className='mt-2 flex justify-center gap-6'>
        {chartData.map((stage, i) => (
          <div key={stage.label} className='text-center'>
            <div className='text-sm font-medium tabular-nums'>{stage.value}</div>
            <div className='text-[10px] text-muted-foreground'>{stage.label}</div>
            {i > 0 && stage.stepRate && (
              <div className='text-[10px] text-muted-foreground'>
                ↓ {stage.stepRate}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
