import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import {
  publish,
  release as releaseApi,
  type PublishPreview,
  type PublishSummary,
  type ReleaseRecord,
} from '@/lib/api-client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle, Check, Upload } from 'lucide-react'
import { ReleaseDiffViewer } from './components/release-diff-viewer'

type PublishResult = {
  success: boolean
  summary?: PublishSummary
  release?: ReleaseRecord | null
  error?: string
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'deployed') return 'default'
  if (status === 'rolled_back') return 'secondary'
  return 'destructive'
}

export default function Publish() {
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null)
  const [publishPreview, setPublishPreview] = useState<PublishPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [releaseRows, setReleaseRows] = useState<ReleaseRecord[]>([])
  const [releaseLoading, setReleaseLoading] = useState(true)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [expandedDiffReleaseID, setExpandedDiffReleaseID] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<ReleaseRecord | null>(null)
  const [rollbackReason, setRollbackReason] = useState('')
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false)
  const [rollbackResult, setRollbackResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const currentRelease = useMemo(
    () =>
      releaseRows.find((row) => row.status === 'deployed') ??
      releaseRows[0] ??
      null,
    [releaseRows]
  )

  const reloadReleases = async () => {
    setReleaseLoading(true)
    try {
      const rows = await releaseApi.list(100)
      setReleaseRows(rows)
      setReleaseError(null)
      if (rows.length === 0) {
        setExpandedDiffReleaseID(null)
      } else if (
        expandedDiffReleaseID &&
        !rows.some((row) => row.release_id === expandedDiffReleaseID)
      ) {
        setExpandedDiffReleaseID(null)
      }
    } catch (error) {
      setReleaseError(error instanceof Error ? error.message : '加载发布记录失败')
    } finally {
      setReleaseLoading(false)
    }
  }

  useEffect(() => {
    void reloadReleases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePublish = async () => {
    setPreviewLoading(true)
    setPublishResult(null)
    try {
      const data = await publish.preview()
      setPublishPreview(data.preview)
      setPreviewOpen(true)
    } catch (e) {
      setPublishResult({ success: false, error: (e as Error).message })
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleConfirmPublish = async () => {
    setPublishing(true)
    try {
      const data = await publish.execute()
      setPublishResult(data)
      setPreviewOpen(false)
      await reloadReleases()
    } catch (e) {
      setPublishResult({ success: false, error: (e as Error).message })
    } finally {
      setPublishing(false)
    }
  }

  const openRollbackDialog = (target: ReleaseRecord) => {
    setRollbackTarget(target)
    setRollbackReason('')
  }

  const handleRollback = async () => {
    if (!rollbackTarget || !currentRelease) return
    if (rollbackTarget.release_id === currentRelease.release_id) return

    setRollbackSubmitting(true)
    try {
      await releaseApi.rollback({
        from_release_id: currentRelease.release_id,
        to_release_id: rollbackTarget.release_id,
        operator: 'admin',
        reason: rollbackReason.trim() || 'manual rollback from publish page',
      })
      setRollbackResult({
        success: true,
        message: `已回滚到 ${rollbackTarget.release_id}`,
      })
      setRollbackTarget(null)
      await reloadReleases()
    } catch (error) {
      setRollbackResult({
        success: false,
        message: error instanceof Error ? error.message : '回滚失败',
      })
    } finally {
      setRollbackSubmitting(false)
    }
  }

  return (
    <>
      <Header fixed>
        <h1 className='text-2xl font-bold'>发布管理</h1>
      </Header>
      <Main>
        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>发布到前端</CardTitle>
              <CardDescription>
                将已发布的产品数据、分类信息和静态资源同步到前端应用。
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <div className='flex flex-wrap items-center gap-3'>
                <Button onClick={handlePublish} disabled={publishing || previewLoading}>
                  <Upload data-icon='inline-start' />
                  {previewLoading ? '生成差异中...' : publishing ? '发布中...' : '执行发布'}
                </Button>
                <Button
                  variant='outline'
                  onClick={() => void reloadReleases()}
                  disabled={releaseLoading}
                >
                  刷新发布记录
                </Button>
              </div>

              {currentRelease ? (
                <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                  <span>当前线上版本：</span>
                  <Badge variant='default'>{currentRelease.release_id}</Badge>
                  <span>发布时间 {formatDateTime(currentRelease.deployed_at)}</span>
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  暂无线上发布记录，执行发布后将自动生成记录。
                </p>
              )}

              {publishResult ? (
                <Alert variant={publishResult.success ? 'default' : 'destructive'}>
                  {publishResult.success ? <Check /> : <AlertCircle />}
                  {publishResult.success && publishResult.summary ? (
                    <>
                      <AlertTitle>发布成功</AlertTitle>
                      <AlertDescription>
                        <p>
                          复制文件：{publishResult.summary.files_copied}，清理文件：
                          {publishResult.summary.files_deleted}
                        </p>
                        <p>发布时间：{publishResult.summary.published_at}</p>
                      </AlertDescription>
                    </>
                  ) : (
                    <>
                      <AlertTitle>发布失败</AlertTitle>
                      <AlertDescription>{publishResult.error}</AlertDescription>
                    </>
                  )}
                </Alert>
              ) : null}

              {publishResult?.success && publishResult.summary?.diff_summary ? (
                <ReleaseDiffViewer
                  title='本次发布差异'
                  diffSummary={publishResult.summary.diff_summary}
                />
              ) : null}

              {rollbackResult ? (
                <Alert variant={rollbackResult.success ? 'default' : 'destructive'}>
                  {rollbackResult.success ? <Check /> : <AlertCircle />}
                  <AlertTitle>{rollbackResult.success ? '回滚成功' : '回滚失败'}</AlertTitle>
                  <AlertDescription>{rollbackResult.message}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>发布记录</CardTitle>
              <CardDescription>
                查看每次发布的版本、状态与差异；支持按目标版本执行回滚。
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {releaseError ? (
                <Alert variant='destructive'>
                  <AlertCircle />
                  <AlertTitle>加载失败</AlertTitle>
                  <AlertDescription>{releaseError}</AlertDescription>
                </Alert>
              ) : null}

              {releaseLoading ? (
                <p className='text-sm text-muted-foreground'>正在加载发布记录...</p>
              ) : null}

              {!releaseLoading && releaseRows.length === 0 ? (
                <p className='text-sm text-muted-foreground'>还没有发布记录。</p>
              ) : null}

              {releaseRows.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Release ID</TableHead>
                      <TableHead>分支</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {releaseRows.map((row) => {
                      const isCurrentRelease = currentRelease?.release_id === row.release_id
                      const showDiff = expandedDiffReleaseID === row.release_id
                      return (
                        [
                          <TableRow key={row.release_id}>
                            <TableCell className='font-medium'>{row.release_id}</TableCell>
                            <TableCell>{row.branch}</TableCell>
                            <TableCell>
                              <Badge variant={statusBadgeVariant(row.status)}>
                                {row.status === 'deployed'
                                  ? '线上版本'
                                  : row.status === 'rolled_back'
                                    ? '已回滚'
                                    : row.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDateTime(row.deployed_at)}</TableCell>
                            <TableCell>
                              <div className='flex flex-wrap items-center gap-2'>
                                <Button
                                  variant='outline'
                                  size='sm'
                                  onClick={() =>
                                    setExpandedDiffReleaseID((current) =>
                                      current === row.release_id ? null : row.release_id
                                    )
                                  }
                                >
                                  {showDiff ? '收起差异' : '查看差异'}
                                </Button>
                                <Button
                                  variant='secondary'
                                  size='sm'
                                  onClick={() => openRollbackDialog(row)}
                                  disabled={isCurrentRelease}
                                >
                                  回滚到此版本
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>,

                          showDiff ? (
                            <TableRow key={`${row.release_id}-diff`}>
                              <TableCell colSpan={5}>
                                <ReleaseDiffViewer
                                  title={`版本 ${row.release_id} 的发布差异`}
                                  diffSummary={row.diff_summary}
                                />
                              </TableCell>
                            </TableRow>
                          ) : null,
                        ]
                      )
                    })}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className='max-h-[90vh] max-w-4xl overflow-hidden'>
            <DialogHeader>
              <DialogTitle>发布差异确认</DialogTitle>
              <DialogDescription>
                请先确认本次将同步到前端的文件变更，再执行发布。
              </DialogDescription>
            </DialogHeader>

            {publishPreview ? (
              <div className='grid max-h-[65vh] gap-4 overflow-y-auto pr-1'>
                <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                  <span>待复制：</span>
                  <Badge variant='outline'>{publishPreview.files_to_copy.length}</Badge>
                  <span>待删除：</span>
                  <Badge variant='outline'>{publishPreview.files_to_delete.length}</Badge>
                </div>
                <ReleaseDiffViewer
                  title='发布前差异预览'
                  diffSummary={publishPreview.diff_summary}
                  emptyText='本次发布没有文件差异。'
                />
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>正在加载差异预览...</p>
            )}

            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setPreviewOpen(false)}
                disabled={publishing}
              >
                取消
              </Button>
              <Button
                onClick={handleConfirmPublish}
                disabled={publishing || !publishPreview}
              >
                {publishing ? '发布中...' : '确认发布'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(rollbackTarget)}
          onOpenChange={(open) => {
            if (!open) setRollbackTarget(null)
          }}
        >
          <DialogContent className='max-h-[90vh] max-w-4xl overflow-hidden'>
            <DialogHeader>
              <DialogTitle>回滚确认</DialogTitle>
              <DialogDescription>
                将当前线上版本回滚到目标版本。提交前请先确认差异内容。
              </DialogDescription>
            </DialogHeader>

            {rollbackTarget ? (
              <div className='grid max-h-[65vh] gap-4 overflow-y-auto pr-1 lg:grid-cols-2'>
                <div className='flex flex-col gap-2'>
                  <p className='text-sm text-muted-foreground'>
                    当前线上版本：{currentRelease?.release_id ?? '-'}
                  </p>
                  <ReleaseDiffViewer
                    title='当前线上版本差异'
                    diffSummary={currentRelease?.diff_summary ?? ''}
                    emptyText='当前线上版本没有记录差异。'
                  />
                </div>

                <div className='flex flex-col gap-2'>
                  <p className='text-sm text-muted-foreground'>
                    目标回滚版本：{rollbackTarget.release_id}
                  </p>
                  <ReleaseDiffViewer
                    title='目标版本差异'
                    diffSummary={rollbackTarget.diff_summary}
                    emptyText='目标版本没有记录差异。'
                  />
                </div>

                <div className='flex flex-col gap-2 lg:col-span-2'>
                  <Label htmlFor='rollback-reason'>回滚原因</Label>
                  <Textarea
                    id='rollback-reason'
                    rows={3}
                    value={rollbackReason}
                    onChange={(event) => setRollbackReason(event.target.value)}
                    placeholder='例如：线上异常，需要回滚到稳定版本'
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setRollbackTarget(null)}
                disabled={rollbackSubmitting}
              >
                取消
              </Button>
              <Button
                variant='destructive'
                onClick={handleRollback}
                disabled={
                  rollbackSubmitting ||
                  !rollbackTarget ||
                  !currentRelease ||
                  rollbackTarget.release_id === currentRelease.release_id
                }
              >
                {rollbackSubmitting ? '回滚中...' : '确认回滚'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Main>
    </>
  )
}
