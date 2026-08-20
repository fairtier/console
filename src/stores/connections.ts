import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ConnectError, Code } from '@connectrpc/connect'
import { connectionClient } from '../api'
import type { Connection } from '../api'

// Workspace-level Connections ("connect Google once"): the entity pipelines
// reference instead of embedding a refresh token, and the source of the live
// tokens the box query engine uses for federated queries. One shared store so
// the Integrations card and the pipeline wizard's connection picker see the
// same list without each doing its own RPC.
//
// NOT related to stores/workspace.ts's `connectionDetails`, which are the
// Lakekeeper/DuckFlight endpoint details shown on the Catalog page.
export const useConnectionsStore = defineStore('connections', () => {
  const connections = ref<Connection[]>([])
  const loading = ref(false)
  // 'unknown' until the first probe; 'unavailable' when the workspace plane
  // serving this Console does not mount the service (an older box).
  const availability = ref<'unknown' | 'unavailable' | 'ready'>('unknown')
  let loadedOnce = false

  async function load(force = false): Promise<void> {
    if (loading.value || (loadedOnce && !force)) return
    loading.value = true
    try {
      const resp = await connectionClient.listConnections({})
      connections.value = resp.connections
      availability.value = 'ready'
      loadedOnce = true
    } catch (err) {
      if (err instanceof ConnectError && err.code === Code.Unimplemented) {
        availability.value = 'unavailable'
        loadedOnce = true
        return
      }
      throw err
    } finally {
      loading.value = false
    }
  }

  /** Redeems a Google consent grant into a workspace connection. */
  async function createFromGoogleGrant(grantId: string, name = ''): Promise<Connection> {
    const resp = await connectionClient.createConnection({
      name,
      source: { case: 'googleGrantId', value: grantId },
    })
    await load(true)
    return resp.connection!
  }

  async function remove(id: string): Promise<void> {
    await connectionClient.deleteConnection({ id })
    await load(true)
  }

  function googleConnections(): Connection[] {
    return connections.value.filter((c) => c.type === 'google')
  }

  return { connections, loading, availability, load, createFromGoogleGrant, remove, googleConnections }
})
