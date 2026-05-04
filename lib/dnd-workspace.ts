/** MIME für Drag & Drop aus dem Workspace-Explorer (Pfad relativ zu agent-workspace). */
export const WORKSPACE_DRAG_MIME = "application/vnd.nemesis.workspace+json";

export type WorkspaceDragPayload = {
  path: string;
  kind: "file" | "dir";
};
