import {
  Package,
  FolderTree,
  Layers,
  Upload,
  LayoutDashboard,
  Settings,
  ScrollText,
  Command,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  teams: [
    {
      name: 'RiSu Admin',
      logo: Command,
      plan: '后台管理',
    },
  ],
  navGroups: [
    {
      title: '管理',
      items: [
        {
          title: '概览',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: '产品管理',
          url: '/products',
          icon: Package,
        },
        {
          title: '分类管理',
          url: '/categories',
          icon: FolderTree,
        },
        {
          title: '预设方案',
          url: '/presets',
          icon: Layers,
        },
        {
          title: '发布',
          url: '/publish',
          icon: Upload,
        },
      ],
    },
    {
      title: '系统',
      items: [
        {
          title: '事件日志',
          url: '/events',
          icon: ScrollText,
        },
        {
          title: '设置',
          url: '/settings',
          icon: Settings,
        },
      ],
    },
  ],
}
