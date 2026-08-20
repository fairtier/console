import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createAppRouter } from './router'
import { i18n } from './i18n'
import { pinia } from './stores'
import { loadRuntimeConfig } from './config/runtime'
import { initErrorTracking } from './lib/sentry'

// Runtime configuration is resolved before anything is built or mounted: the
// API and Casdoor URLs come from /config.json at deploy time, and nothing may
// read a half-built config.
await loadRuntimeConfig()

const app = createApp(App)

// Before any plugin and before mount: the DSN comes from the config resolved
// above, and Sentry's Vue error handler has to be installed while the app is
// still unmounted to see a first-render failure.
initErrorTracking(app)

app.use(pinia)
    .use(createAppRouter())
    .use(i18n)
    .mount('#app')
