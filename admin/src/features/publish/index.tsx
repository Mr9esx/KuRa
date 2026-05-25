import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { publish } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Upload, Check, AlertCircle } from 'lucide-react'

export default function Publish() {
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    summary?: { files_copied: number; files_deleted: number; published_at: string }
    error?: string
  } | null>(null)

  const handlePublish = async () => {
    if (!confirm('确认发布？将同步最新数据和资源到前端。')) return
    setPublishing(true)
    setResult(null)
    try {
      const data = await publish.execute()
      setResult(data)
    } catch (e) {
      setResult({ success: false, error: (e as Error).message })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <>
      <Header sticky>
        <h1 className='text-2xl font-bold'>发布管理</h1>
      </Header>
      <Main>
        <div className='max-w-lg'>
          <Card>
            <CardHeader>
              <CardTitle>发布到前端</CardTitle>
              <CardDescription>
                将已发布的产品数据、分类信息和静态资源同步到前端应用。
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Button onClick={handlePublish} disabled={publishing}>
                <Upload className='mr-2 h-4 w-4' />
                {publishing ? '发布中...' : '执行发布'}
              </Button>

              {result && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-4 ${
                    result.success
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                      : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                  }`}
                >
                  {result.success ? (
                    <Check className='mt-0.5 h-5 w-5 text-green-600' />
                  ) : (
                    <AlertCircle className='mt-0.5 h-5 w-5 text-red-600' />
                  )}
                  <div>
                    {result.success && result.summary ? (
                      <>
                        <p className='font-medium'>发布成功</p>
                        <p className='text-sm text-muted-foreground'>
                          复制文件：{result.summary.files_copied} 个，
                          清理文件：{result.summary.files_deleted} 个
                        </p>
                        <p className='text-xs text-muted-foreground mt-1'>
                          发布时间：{result.summary.published_at}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className='font-medium'>发布失败</p>
                        <p className='text-sm text-muted-foreground'>{result.error}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
