import type { TourStep } from "@/components/tour"

function StepContent({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <div className="pr-12 text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </div>
  )
}

const desktopSteps: TourStep[] = [
  {
    selectorId: "tour-block-picker",
    position: "bottom",
    padding: 6,
    content: (
      <StepContent
        title="选择框体尺寸"
        desc="框体是你的收纳空间基础，不同尺寸适用于不同场景。"
      />
    ),
  },
  {
    selectorId: "tour-categories",
    position: "bottom",
    padding: 6,
    content: (
      <StepContent
        title="按分类浏览"
        desc="筛选不同类型的收纳件，快速找到你需要的。"
      />
    ),
  },
  {
    selectorId: "tour-catalog-items",
    position: "right",
    padding: 6,
    content: (
      <StepContent
        title="选择收纳件"
        desc="点击选中一个收纳件，然后在 3D 预览中放置；也可以直接拖拽到画布上。"
      />
    ),
  },
  {
    selectorId: "tour-viewport",
    position: "left",
    padding: 0,
    content: (
      <StepContent
        title="3D 预览"
        desc="点击网格放置收纳件，拖拽已放置的可以移动位置，按 Delete 键删除。支持鼠标旋转、缩放画布。"
      />
    ),
  },
  {
    selectorId: "tour-materials",
    position: "bottom",
    padding: 4,
    content: (
      <StepContent
        title="材质颜色"
        desc="切换框体和收纳件的颜色材质，打造个性化方案。"
      />
    ),
  },
  {
    selectorId: "tour-presets",
    position: "bottom",
    padding: 4,
    content: (
      <StepContent
        title="套装方案"
        desc="一键应用预设方案，快速填充收纳布局。"
      />
    ),
  },
  {
    selectorId: "tour-export",
    position: "bottom",
    padding: 4,
    content: (
      <StepContent
        title="导出数据"
        desc="导出模型数据或购物清单，方便后续使用。"
      />
    ),
  },
  {
    selectorId: "tour-replay",
    position: "bottom",
    padding: 6,
    showSkip: false,
    content: (
      <StepContent
        title="随时重看引导"
        desc="如果需要再次查看功能引导，点击这个按钮即可重新播放。"
      />
    ),
  },
]

const mobileSteps: TourStep[] = [
  {
    selectorId: "tour-m-block-picker",
    position: "bottom",
    padding: 6,
    content: (
      <StepContent
        title="切换收纳件与框体"
        desc="「收纳件」浏览物品，「框体」选择不同尺寸的收纳空间。"
      />
    ),
  },
  {
    selectorId: "tour-m-categories",
    position: "bottom",
    padding: 6,
    content: (
      <StepContent
        title="按分类浏览"
        desc="筛选不同类型的收纳件，快速找到你需要的。"
      />
    ),
  },
  {
    selectorId: "tour-m-catalog-items",
    position: "top",
    padding: 6,
    content: (
      <StepContent
        title="选择收纳件"
        desc="点击选中一个收纳件，然后在上方 3D 预览中点击放置；也可以长按拖拽到画布上。"
      />
    ),
  },
  {
    selectorId: "tour-viewport",
    position: "bottom",
    padding: 0,
    content: (
      <StepContent
        title="3D 预览"
        desc="点击网格放置收纳件，拖拽已放置的可以移动位置。支持手势旋转、缩放画布。"
      />
    ),
  },
  {
    selectorId: "tour-m-materials",
    position: "top",
    padding: 4,
    content: (
      <StepContent
        title="材质颜色"
        desc="切换框体和收纳件的颜色材质，打造个性化方案。"
      />
    ),
  },
  {
    selectorId: "tour-m-presets",
    position: "top",
    padding: 4,
    content: (
      <StepContent
        title="套装方案"
        desc="一键应用预设方案，快速填充收纳布局。"
      />
    ),
  },
  {
    selectorId: "tour-m-export",
    position: "top",
    padding: 4,
    content: (
      <StepContent
        title="导出数据"
        desc="导出模型数据或购物清单，方便后续使用。"
      />
    ),
  },
  {
    selectorId: "tour-m-replay",
    position: "bottom",
    padding: 6,
    showSkip: false,
    content: (
      <StepContent
        title="随时重看引导"
        desc="如果需要再次查看功能引导，点击这个按钮即可重新播放。"
      />
    ),
  },
]

export function getTourSteps(mobile: boolean) {
  return mobile ? mobileSteps : desktopSteps
}

export const TOUR_STORAGE_KEY = "kura-tour-completed"
