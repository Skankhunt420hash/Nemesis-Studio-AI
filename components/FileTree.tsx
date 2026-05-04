"use client";

import { useCallback, useState } from "react";
import {
  WORKSPACE_DRAG_MIME,
  type WorkspaceDragPayload,
} from "@/lib/dnd-workspace";

export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
};

function Row({
  node,
  depth,
  onFile,
}: {
  node: TreeNode;
  depth: number;
  onFile: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);

  const pad = { paddingLeft: 8 + depth * 12 } as const;

  const onDragStart = (e: React.DragEvent, kind: "file" | "dir") => {
    const payload: WorkspaceDragPayload = { path: node.path, kind };
    e.dataTransfer.setData(WORKSPACE_DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  if (node.type === "file") {
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, "file")}
        onClick={() => onFile(node.path)}
        className="flex w-full cursor-grab items-center gap-1 rounded px-1 py-0.5 text-left text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] active:cursor-grabbing"
        style={pad}
        title="Ziehen → Kontext im Agenten-Panel"
      >
        <span className="opacity-70">📄</span>
        {node.name}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, "dir")}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-grab items-center gap-1 rounded px-1 py-0.5 text-left text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] active:cursor-grabbing"
        style={pad}
        title="Ziehen → Kontext im Agenten-Panel"
      >
        <span className="w-3 text-[10px] text-[#858585]">{open ? "▼" : "▶"}</span>
        <span className="opacity-70">📁</span>
        {node.name}
      </button>
      {open && node.children?.map((c) => (
        <Row key={c.path} node={c} depth={depth + 1} onFile={onFile} />
      ))}
    </div>
  );
}

export function FileTree({
  tree,
  onSelectFile,
}: {
  tree: TreeNode[];
  onSelectFile: (path: string) => void;
}) {
  const onFile = useCallback(
    (p: string) => {
      onSelectFile(p);
    },
    [onSelectFile]
  );

  return (
    <div className="select-none py-1">
      {tree.map((n) => (
        <Row key={n.path || n.name} node={n} depth={0} onFile={onFile} />
      ))}
    </div>
  );
}
