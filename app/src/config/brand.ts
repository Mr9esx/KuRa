export const APP_TAB_TITLE = "KuRa - 「仓」"
export const APP_PAGE_TITLE = "KuRa"
export const APP_PROJECT_NAME = "KuRa"
export const APP_AUTHOR_NAME = "Lee"
export const APP_LICENSE_NAME = "CC BY 4.0"
export const APP_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"

export const APP_SOCIAL = {
  xiaohongshu: {
    label: `${APP_PAGE_TITLE} 小红书`,
    account: `@${APP_PAGE_TITLE}官方账号`,
  },
  feedback: {
    label: `${APP_PAGE_TITLE}收纳需求采集`,
    url: "https://f.kdocs.cn/g/RY1Uh77M/",
  },
} as const

export const APP_PREFIX = "app"

export const STORAGE_KEYS = {
  theme: `${APP_PREFIX}-theme`,
  tourCompleted: `${APP_PREFIX}-tour-completed`,
} as const

export const CUSTOM_EVENTS = {
  dragItemStart: `${APP_PREFIX}:drag-item-start`,
  dragItemEnd: `${APP_PREFIX}:drag-item-end`,
  tourReplay: `${APP_PREFIX}-tour-replay`,
} as const

export const DATA_TRANSFER_TYPE = `application/x-${APP_PREFIX}-sku`

export const EXPORT_PREFIX = APP_PREFIX

export const METADATA_PREFIX = APP_PREFIX
