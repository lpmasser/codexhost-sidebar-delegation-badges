/**
 * Subset of codexhost Desktop Extension API v1 and Thread tree contracts
 * matching `@codexhost/shared-contracts`.
 */

export type ThreadTreeStatus = "running" | "waiting" | "idle" | "unknown";

export interface ThreadTreeNode {
  harnessId: string;
  title?: string | undefined;
  status: ThreadTreeStatus;
  archived: boolean;
}

export interface ThreadTreeSnapshot {
  revision: number;
  parents: Record<string, string>;
  nodes: Record<string, ThreadTreeNode>;
  truncated: boolean;
}

export interface DesktopSidebarRow {
  readonly element: HTMLElement;
  readonly hostId: string | null;
  readonly isLocal: boolean;
  readonly threadId: string | null;
  readonly draftId: string | null;
  isConnected(): boolean;
}

export interface DesktopExtensionApiV1 {
  readonly id: string;
  readonly apiVersion: 1;
  readonly signal: AbortSignal;
  sidebar: { observeRows(cb: (rows: readonly DesktopSidebarRow[]) => void): () => void };
  threads: { watchTree(cb: (tree: ThreadTreeSnapshot) => void): () => void };
  navigate: { openThread(threadId: string): Promise<void> };
  harnesses: { describe(harnessId: string): { name: string; icon?: string } | undefined };
  dom: {
    mount(
      node: Element,
      parent: Element,
      position?: "append" | "prepend" | "before" | "after",
    ): void;
    mark(target: Element, name: string): void;
    unmark(target: Element, name: string): void;
  };
  track(teardown: () => void): void;
}

export type DesktopExtensionDispose = () => void | Promise<void>;

export interface DesktopExtensionDefinitionV1 {
  activate(
    api: DesktopExtensionApiV1,
  ): void | DesktopExtensionDispose | Promise<void | DesktopExtensionDispose>;
}

export type DesktopExtensionDefine = (definition: DesktopExtensionDefinitionV1) => void;
