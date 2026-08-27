import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadWorkspaceBootstrap } from '../api/workspaceBootstrap'

/**
 * Endpoints of the workspace's sibling services, for the pages that link out
 * to them. Filled from the bootstrap document (workspace-api v0.18+ carries
 * them); against an older API the endpoint fields stay blank and the views
 * degrade to not offering the link (see CatalogView's / AppsView's ready
 * checks).
 */
export interface ConnectionDetails {
    lakekeeperUrl: string
    lakekeeperWarehouse: string
    customerDomain: string
    cubeUrl: string
    rillUrl: string
    duckflightUrl: string
}

/**
 * What this workspace is and what it runs, self-described via the API's
 * unauthenticated bootstrap document (`/.well-known/fairtier-workspace`).
 * There is no provisioning lifecycle here: the workspace is up, or you would
 * not be talking to it.
 */
export const useWorkspaceStore = defineStore('workspace', () => {
    const slug = ref('')
    const name = ref('')
    const rillEnabled = ref(false)
    const cubeEnabled = ref(false)
    const duckflightEnabled = ref(false)
    const dltEnabled = ref(false)
    const filedropEnabled = ref(false)
    const googleOauthEnabled = ref(false)
    /**
     * Which DuckDB extensions this box accepts in a `duckdb` pipeline, or
     * undefined when it is too old to say. The pipeline wizard renders the
     * intersection with the tiles it has forms for; undefined means offer them
     * all, which is what it did before boxes advertised this.
     */
    const duckdbExtensions = ref<string[] | undefined>(undefined)
    /**
     * Which source types this box's worker can probe ("Test connection"), or
     * undefined when it is too old to say. Undefined means no button: a button
     * that queues a test nothing will ever claim is worse than none.
     */
    const testableSourceTypes = ref<string[] | undefined>(undefined)
    const connectionDetails = ref<ConnectionDetails | null>(null)
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    /** True once the workspace has described itself. */
    const isReady = computed(() => !!slug.value)

    let inFlight: Promise<void> | null = null

    /**
     * Loads the workspace's self-description exactly once. Safe to call from
     * multiple views — deduplicates the request.
     */
    function ensureLoaded(): Promise<void> {
        if (isReady.value) return Promise.resolve()
        if (!inFlight) {
            inFlight = load().finally(() => {
                inFlight = null
            })
        }
        return inFlight
    }

    async function load(): Promise<void> {
        isLoading.value = true
        error.value = null
        try {
            const doc = await loadWorkspaceBootstrap()
            if (!doc) {
                error.value = 'workspace API is unreachable'
                return
            }
            slug.value = doc.slug
            name.value = doc.slug
            rillEnabled.value = doc.capabilities.rill
            cubeEnabled.value = doc.capabilities.cube
            duckflightEnabled.value = doc.capabilities.duckflight
            filedropEnabled.value = doc.capabilities.filedrop
            googleOauthEnabled.value = doc.capabilities.google_oauth
            duckdbExtensions.value = doc.capabilities.duckdb_extensions
            testableSourceTypes.value = doc.capabilities.testable_source_types
            dltEnabled.value = true
            connectionDetails.value = {
                lakekeeperUrl: doc.lakekeeper_url ?? '',
                lakekeeperWarehouse: doc.lakekeeper_warehouse ?? '',
                customerDomain: doc.customer_domain,
                cubeUrl: doc.cube_url ?? '',
                rillUrl: doc.rill_url ?? '',
                duckflightUrl: doc.duckflight_url ?? '',
            }
        } finally {
            isLoading.value = false
        }
    }

    return {
        // State
        slug,
        name,
        rillEnabled,
        cubeEnabled,
        duckflightEnabled,
        dltEnabled,
        filedropEnabled,
        googleOauthEnabled,
        duckdbExtensions,
        testableSourceTypes,
        connectionDetails,
        isLoading,
        error,

        // Getters
        isReady,

        // Actions
        ensureLoaded,
    }
})
