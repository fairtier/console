import { createClient } from "@connectrpc/connect"
import { transport } from "./transport"
import { HealthService as WorkspaceHealthService } from "./gen/workspace_health_pb.js"
import { LakekeeperUserService } from "./gen/lakekeeper_user_pb.js"
import { WarehouseService } from "./gen/warehouse_pb.js"
import { SnapshotService } from "./gen/snapshot_pb.js"
import { PipelineService } from "./gen/pipeline_pb.js"
import { PipelineAssistService } from "./gen/pipeline_assist_pb.js"
import { TransformationService } from "./gen/transformation_pb.js"
import { AssistService } from "./gen/assist_pb.js"
import { BoxRepoService } from "./gen/boxrepo_pb.js"
import { NotificationService } from "./gen/notification_pb.js"
import { QueryService } from "./gen/query_pb.js"
import { DemoService } from "./gen/demo_pb.js"
import { OAuthClientService } from "./gen/oauthclient_pb.js"
import { ConnectionService } from "./gen/connection_pb.js"

// One plane, one transport: everything here is served by the workspace's own
// API (see ./transport). Identity, billing and provisioning are not product
// concerns — whoever hosts the workspace owns those, elsewhere.
export { transport, workspaceApiBase } from "./transport"

export const lakekeeperUserClient = createClient(LakekeeperUserService, transport)
export const warehouseClient = createClient(WarehouseService, transport)
export const snapshotClient = createClient(SnapshotService, transport)
export const pipelineClient = createClient(PipelineService, transport)
export const pipelineAssistClient = createClient(PipelineAssistService, transport)
export const transformationClient = createClient(TransformationService, transport)
export const assistClient = createClient(AssistService, transport)
export const boxRepoClient = createClient(BoxRepoService, transport)
export const notificationClient = createClient(NotificationService, transport)
export const queryClient = createClient(QueryService, transport)
export const demoClient = createClient(DemoService, transport)
// The workspace's OWN vendor OAuth app (Google, for Sheets). The pipeline
// mirror needs the pair too, so it lives with the workspace.
export const oauthClientClient = createClient(OAuthClientService, transport)
// Workspace-level Connections ("connect Google once"): pipelines reference
// one by id, and the query engine consumes tokens minted from it.
export const connectionClient = createClient(ConnectionService, transport)
export const workspaceHealthClient = createClient(WorkspaceHealthService, transport)

// Re-export generated types for convenience
export type { ColumnInfo, TableRef, ColumnSchema, ExecuteQueryResponse } from "./gen/query_pb.js"
export type { DemoStatus, LoadDemoProjectResponse, GetDemoStatusResponse } from "./gen/demo_pb.js"
export type { Connection } from "./gen/connection_pb.js"
