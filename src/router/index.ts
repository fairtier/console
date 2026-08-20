import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import LoginView from '../views/LoginView.vue'
import CallbackView from '../views/CallbackView.vue'
import AppLayout from '../layouts/AppLayout.vue'

const OverviewView = () => import('../views/OverviewView.vue')
const CatalogView = () => import('../views/CatalogView.vue')
// SqlView pulls in CodeMirror — keep it lazy so the editor bundle only loads
// when the SQL page is opened.
const SqlView = () => import('../views/SqlView.vue')
const PipelinesView = () => import('../views/PipelinesView.vue')
const PipelineWizardView = () => import('../views/PipelineWizardView.vue')
const TransformationsView = () => import('../views/TransformationsView.vue')
// RillView pulls in CodeMirror (like SqlView) — keep it lazy.
const RillView = () => import('../views/RillView.vue')
const AppsView = () => import('../views/AppsView.vue')
const GitView = () => import('../views/GitView.vue')
const IntegrationsView = () => import('../views/IntegrationsView.vue')
const ServiceAccountsView = () => import('../views/ServiceAccountsView.vue')

const appChildren: RouteRecordRaw[] = [
    { path: 'overview', name: 'overview', component: OverviewView },
    { path: 'catalog', name: 'catalog', component: CatalogView },
    { path: 'sql', name: 'sql', component: SqlView },
    { path: 'pipelines', name: 'pipelines', component: PipelinesView },
    { path: 'pipelines/new', name: 'pipeline-new', component: PipelineWizardView },
    { path: 'transformations', name: 'transformations', component: TransformationsView },
    { path: 'rill', name: 'rill', component: RillView },
    { path: 'apps', name: 'apps', component: AppsView },
    { path: 'git', name: 'git', component: GitView },
    { path: 'integrations', name: 'integrations', component: IntegrationsView },
    { path: 'service-accounts', name: 'service-accounts', component: ServiceAccountsView },
    // Old URLs that moved.
    { path: 'dashboard', redirect: { name: 'overview' } },
    { path: 'iceberg', redirect: { name: 'catalog' } },
    { path: 'connect', redirect: { name: 'catalog' } },
]

export function createAppRouter() {
    const router = createRouter({
        history: createWebHistory(),
        routes: [
            {
                path: '/',
                name: 'login',
                component: LoginView,
                meta: { requiresGuest: true },
            },
            {
                path: '/callback',
                name: 'callback',
                component: CallbackView,
            },
            {
                path: '/',
                component: AppLayout,
                meta: { requiresAuth: true },
                redirect: { name: 'overview' },
                children: appChildren,
            },
            // Catch-all redirect to login
            {
                path: '/:pathMatch(.*)*',
                redirect: '/',
            },
        ],
    })

    // Navigation guards
    router.beforeEach(async (to, _from, next) => {
        const { isAuthenticated } = useAuth()

        // Protected routes require authentication
        if (to.meta.requiresAuth && !isAuthenticated.value) {
            next({ name: 'login' })
            return
        }

        // Guest-only routes (login) redirect to the app if already authenticated
        if (to.meta.requiresGuest && isAuthenticated.value) {
            next({ name: 'overview' })
            return
        }

        next()
    })

    return router
}
