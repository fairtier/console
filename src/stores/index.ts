import { createPinia } from 'pinia'

export const pinia = createPinia()

// Re-export all stores for convenience
export { useUserStore } from './user'
export { useSettingsStore } from './settings'
export { useWorkspaceStore } from './workspace'
export { useNotificationsStore } from './notifications'
export { useConnectionsStore } from './connections'
