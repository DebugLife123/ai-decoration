# Canvas Host Integration

`CanvasApi` in `src/features/canvas/contracts.ts` is the normalized boundary between a host and the editor. The editor consumes Canvas DTOs; it does not consume a host's project aggregate directly.

## DTOs

| Type | Required identity and data |
| --- | --- |
| `CanvasProjectInfo` | `projectId`, `name`, `createdAt`, `updatedAt` |
| `CanvasProjectDocument` | `projectId`, nodes, connections, chat sessions, background, image-info setting, viewport and current version |
| `CanvasProjectAsset` | `assetId`, `projectId`, `name`, `mimeType`, stable `url`, `createdAt`, `kind`; image/video also require width and height |
| `CanvasTask` | `taskId`, `projectId`, `type`, `status`, source/result asset and version IDs, error, timestamps |
| `CanvasVersion` | `versionId`, `projectId`, source/result asset IDs, name and creation time |
| `CanvasVersionDocument` | `versionId`, `projectId`, title, node/connection snapshot, canvas appearance and viewport |

Task status is `QUEUED`, `RUNNING`, `SUCCEEDED` or `FAILED`. A succeeded task must have both `resultAssetId` and `versionId`; a failed task must have an error and no result identities. Editing creates a new version and preserves the source version.

Example task:

```json
{
  "taskId": "task-1",
  "projectId": "project-1",
  "type": "EDIT",
  "status": "SUCCEEDED",
  "sourceAssetId": "asset-source",
  "sourceVersionId": "version-1",
  "resultAssetId": "asset-result",
  "versionId": "version-2",
  "error": null,
  "createdAt": "2026-01-01T10:00:00Z",
  "updatedAt": "2026-01-01T10:01:00Z"
}
```

## HTTP Adapter

`createCanvasHttpAdapter` uses the standard routes below and validates every response against these DTOs:

| Operation | Route |
| --- | --- |
| Project CRUD/list | `/api/v1/projects` and `/api/v1/projects/{projectId}` |
| Canvas document | `/api/v1/projects/{projectId}/document` |
| Project assets/content | `/api/v1/projects/{projectId}/assets` |
| Upload ticket/complete/cancel/register | `/api/v1/projects/{projectId}/assets/upload-ticket` and `/assets/uploads/{uploadId}` |
| Task submit/query | `/api/v1/tasks` and `/api/v1/tasks/{taskId}` |
| Versions/snapshots | `/api/v1/projects/{projectId}/versions` and `/versions/{versionId}` |

The adapter expects bare DTO JSON by default. For an envelope such as `{ "code": "OK", "message": "success", "data": { ... }, "timestamp": "..." }`, set `responseEnvelope: "data"`. The same unwrapping applies to list and `202 Accepted` bodies. HTTP errors are decoded before envelope unwrapping, preserving the host `code` and `message`.

Asset upload uses a two-step flow: request an upload ticket, PUT bytes to its `uploadUrl` with the supplied headers, then complete and register the asset. A host using multipart upload should implement the same `CanvasApi` operations itself instead of pretending to support upload tickets.

## Host Mapping

Use `createApiCanvasHostAdapters(api)` after implementing the host's `CanvasApi`. This is the recommended path when the host uses different route names, response envelopes, identifier formats, or business DTOs. The host owns authentication headers, URL materialization, access checks, DTO conversion and its chosen upload flow.

`createCanvasHttpHostAdapters(options)` is for a backend that already implements the standard Canvas routes and DTOs. `responseEnvelope: "data"` only removes the outer response envelope; it does not map project aggregates, field names, status values, IDs or version snapshots.

For a host with an existing project aggregate, keep that aggregate in the host adapter. Map it to `CanvasProjectInfo`, persist `CanvasProjectDocument` separately or in an owned canvas field, and map task and version identities explicitly. Do not add host-specific fields to `CanvasApi` or make the generic package import the host's services.
