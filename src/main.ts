import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createAppRouter } from './router'
import { i18n } from './i18n'
import { pinia } from './stores'
import { loadRuntimeConfig, runtimeConfig } from './config/runtime'
import { initErrorTracking } from './lib/sentry'
import { configureSharedPrefsPeer } from './lib/prefs'
import { preconnect } from './lib/preconnect'

// Runtime configuration is resolved before anything is built or mounted: the
// API and Casdoor URLs come from /config.json at deploy time, and nothing may
// read a half-built config.
await loadRuntimeConfig()

// Display preferences are shared with the Console that manages this workspace's
// account, over a cookie on the domain the two have in common — which is only
// knowable once accountUrl has resolved. Unset (self-host) it stays host-only.
configureSharedPrefsPeer(runtimeConfig().accountUrl)

// Half the sidebar points at that Console's origin, which this browser has
// usually never talked to. Warm it now, so a crossing is a page load rather
// than a page load plus a handshake.
preconnect(runtimeConfig().accountUrl)

const app = createApp(App)

// Before any plugin and before mount: the DSN comes from the config resolved
// above, and Sentry's Vue error handler has to be installed while the app is
// still unmounted to see a first-render failure.
initErrorTracking(app)

app.use(pinia)
    .use(createAppRouter())
    .use(i18n)
    .mount('#app')
