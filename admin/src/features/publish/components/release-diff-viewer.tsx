import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type DiffSection = {
  title: string
  lines: string[]
}

type DiffStats = {
  commits: number
  added: number
  modified: number
  deleted: number
  renamed: number
  productChanges: number
  categoryChanges: number
  presetChanges: number
}

type ReleaseDiffViewerProps = {
  diffSummary?: string | null
  title?: string
  emptyText?: string
  className?: string
}

function parseDiffSummary(diffSummary: string): DiffSection[] {
  const sections: DiffSection[] = []
  let current: DiffSection | null = null

  for (const line of diffSummary.split('\n')) {
    if (line.startsWith('## ')) {
      current = { title: line.replace(/^##\s+/, '').trim(), lines: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { title: '发布摘要', lines: [] }
      sections.push(current)
    }
    current.lines.push(line)
  }

  return sections.filter((section) =>
    section.lines.some((line) => line.trim().length > 0)
  )
}

function collectDiffStats(diffSummary: string): DiffStats {
  const stats: DiffStats = {
    commits: 0,
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    productChanges: 0,
    categoryChanges: 0,
    presetChanges: 0,
  }

  let inCommitSection = false
  let inNameStatusSection = false
  for (const line of diffSummary.split('\n')) {
    if (line.startsWith('## ')) {
      const sectionTitle = line.replace(/^##\s+/, '').trim()
      inCommitSection = sectionTitle === 'Commit Diff'
      inNameStatusSection =
        sectionTitle === 'File Diff (name-status)' ||
        sectionTitle === 'Data Diff (name-status)'
      continue
    }

    if (inCommitSection && /^[0-9a-f]{7,}\s+/i.test(line)) {
      stats.commits += 1
    }

    if (!inNameStatusSection) continue
    if (/^A\t/.test(line)) stats.added += 1
    if (/^M\t/.test(line)) stats.modified += 1
    if (/^D\t/.test(line)) stats.deleted += 1
    if (/^R[0-9]*\t/.test(line)) stats.renamed += 1
    if (line.includes('\tdata/products/')) stats.productChanges += 1
    if (line.includes('\tdata/categories/')) stats.categoryChanges += 1
    if (line.includes('\tdata/presets/')) stats.presetChanges += 1
  }

  return stats
}

function lineClassName(line: string): string {
  if (/^A\t/.test(line) || line.startsWith('+')) return 'text-emerald-600'
  if (/^D\t/.test(line) || line.startsWith('-')) return 'text-destructive'
  if (/^M\t/.test(line)) return 'text-amber-600'
  if (/^R[0-9]*\t/.test(line)) return 'text-sky-600'
  return 'text-foreground'
}

export function ReleaseDiffViewer({
  diffSummary,
  title,
  emptyText = '当前版本没有可展示的差异信息。',
  className,
}: ReleaseDiffViewerProps) {
  const sections = useMemo(
    () => (diffSummary ? parseDiffSummary(diffSummary) : []),
    [diffSummary]
  )
  const stats = useMemo(
    () => (diffSummary ? collectDiffStats(diffSummary) : null),
    [diffSummary]
  )

  if (!diffSummary || sections.length === 0) {
    return (
      <div className={cn('rounded-md border p-3 text-sm text-muted-foreground', className)}>
        {title ? <p className='mb-1 font-medium text-foreground'>{title}</p> : null}
        {emptyText}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3 rounded-md border p-3', className)}>
      {title ? <p className='text-sm font-medium'>{title}</p> : null}
      {stats ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='secondary'>提交 {stats.commits}</Badge>
          <Badge variant='outline'>新增 {stats.added}</Badge>
          <Badge variant='outline'>修改 {stats.modified}</Badge>
          <Badge variant='outline'>删除 {stats.deleted}</Badge>
          <Badge variant='outline'>重命名 {stats.renamed}</Badge>
          <Badge variant='outline'>产品变更 {stats.productChanges}</Badge>
          <Badge variant='outline'>分类变更 {stats.categoryChanges}</Badge>
          <Badge variant='outline'>预设变更 {stats.presetChanges}</Badge>
        </div>
      ) : null}

      <div className='flex flex-col gap-3'>
        {sections.map((section) => (
          <div key={section.title} className='flex flex-col gap-2'>
            <p className='text-sm text-muted-foreground'>{section.title}</p>
            <ScrollArea className='h-48 rounded-md border bg-muted/20'>
              <pre className='p-3 font-mono text-xs leading-relaxed'>
                {section.lines.map((line, index) => (
                  <span
                    key={`${section.title}-${index}`}
                    className={cn('block', lineClassName(line))}
                  >
                    {line.trim().length === 0 ? ' ' : line}
                  </span>
                ))}
              </pre>
            </ScrollArea>
          </div>
        ))}
      </div>
    </div>
  )
}
