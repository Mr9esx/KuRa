export const APP_NAME = "KuRa"

export const APP_SOCIAL = {
  xiaohongshu: {
    label: `${APP_NAME} 小红书`,
    account: `@${APP_NAME}官方账号`,
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
