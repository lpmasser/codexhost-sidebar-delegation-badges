# Sidebar Delegation Badges · 侧栏委派角标

[中文](#中文) · [English](#english)

---

## 中文

`sidebar-delegation-badges` 是 [codexhost](https://github.com/BytePioneer-AI/codex-host) 的 Desktop UI 扩展：在保留原生侧栏布局的前提下，在有委派子会话的本机 Thread 的 Agent 图标右下角显示子会话数量和最紧急状态；点击或键盘激活角标可打开子会话菜单并直接跳转。

### 功能特性

- **不重排原生侧栏**：只在本机 Thread 的 Agent 图标角标位叠加数量与状态，远程 Host 行不受影响。
- **实时状态着色**：通过 Desktop 扩展 API v1 的 `api.threads.watchTree` 实时订阅会话树（支持共享 Host 拓扑，按子会话执行 owner 读取实时状态，断连时显示「状态未知」而不是误报为空闲），按优先级着色：`待回答` > `运行中` > `状态未知` > `无活动`。
- **子会话菜单与键盘操作**：点击角标或按 `Enter` / `Space` 打开菜单，按紧急程度排序显示各子会话的 Agent 图标、标题与状态；支持 `↑` / `↓` 切换、`Esc` 关闭并归还焦点，点击任意子会话直接跳转。
- **生命周期安全**：侧栏虚拟列表行回收/卸载、外部滚动、窗口隐藏、父会话消失或扩展卸载时自动撤回弹层，防止旧菜单误触发导航。

### 与「侧栏委派树」互斥

本扩展与「侧栏委派树」（`sidebar-thread-tree`）共用 `sidebar.thread-badge` 槽位，**同一时间只能启用其中一个**。在设置中启用其中一个时，另一个会处于槽位冲突或停用状态；关闭后原生侧栏立即恢复原样。

### 安装方式

1. **插件市场（推荐）**：在 codexhost 中打开 **设置 → 插件**，搜索并安装 **侧栏委派角标（Sidebar Delegation Badges）**。
2. **通过 GitHub 仓库链接安装**：在 **设置 → 插件 → 导入插件** 中填入本仓库地址：
   ```
   https://github.com/lpmasser/codexhost-sidebar-delegation-badges
   ```
   默认分支根目录已包含 `manifest.json`、构建好的 `desktop.js` 和 `desktop.css`。
3. **本地 `.zip` 导入**：在 **设置 → 插件 → 导入插件 → 本地 `.zip`** 中选择打包生成的 `sidebar-delegation-badges.zip`。

### 本地开发与构建

需要 Node.js 22 或 24：

```sh
npm ci
npm test
npm run typecheck
npm run build
```

生成可本地导入或用于 Release 的 `.zip` 包：

```sh
npm run pack -- /path/to/sidebar-delegation-badges.zip
```

> 默认分支提交了构建产物 `desktop.js` 与 `desktop.css`，修改 `src/` 后请运行 `npm run build` 并一并提交。

---

## English

`sidebar-delegation-badges` is a [codexhost](https://github.com/BytePioneer-AI/codex-host) Desktop UI extension that displays a corner count and urgency indicator on the sidebar Agent icon of any local Thread that has delegated child Threads. Activating the badge opens a popover listing each child Thread with its live status for quick navigation, without altering the native sidebar layout.

### Features

- **Native sidebar layout preserved**: Adds a compact corner badge to local Thread Agent icons only; remote Host rows are left untouched.
- **Live urgency indicator**: Subscribes to `api.threads.watchTree` (Desktop Extension API v1), which tracks live child status from each Thread's execution owner — including Shared Host topologies — and surfaces `unknown` on disconnect instead of falsely showing `idle`. Urgency order: `waiting` > `running` > `unknown` > `idle`.
- **Keyboard-accessible child menu**: Click the badge or press `Enter` / `Space` to list child Threads sorted by urgency with Agent icon, title, and live status. Supports `ArrowUp` / `ArrowDown` navigation, `Escape` focus restoration, and click-to-open navigation.
- **Safe popover lifecycle**: Dismisses the popover automatically when a virtualized sidebar row is recycled or unmounted, when the sidebar scrolls, when the document is hidden, when the parent disappears, or when the extension unloads — preventing clicks on stale menus from triggering navigation.

### Mutual Exclusion with Sidebar Thread Tree

This extension declares the `sidebar.thread-badge` slot and shares it with **Sidebar Thread Tree** (`sidebar-thread-tree`). **Only one of the two can be enabled at a time.** Disabling the extension restores the native sidebar immediately.

### Installation

1. **Marketplace (recommended)**: Open **Settings → Plugins** in codexhost and install **Sidebar Delegation Badges**.
2. **From GitHub repository URL**: Open **Settings → Plugins → Import plugin** and enter:
   ```
   https://github.com/lpmasser/codexhost-sidebar-delegation-badges
   ```
   The default branch includes `manifest.json` alongside the prebuilt `desktop.js` and `desktop.css`.
3. **Local `.zip` import**: Open **Settings → Plugins → Import plugin → Local `.zip`** and select `sidebar-delegation-badges.zip`.

### Development & Build

Requires Node.js 22 or 24:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Pack a distributable `.zip` archive:

```sh
npm run pack -- /path/to/sidebar-delegation-badges.zip
```

> Built artifacts (`desktop.js` and `desktop.css`) are committed on the default branch so the repository can be installed directly without a build step. Run `npm run build` after editing files in `src/`.

---

## License & Attribution

Licensed under the **GNU Lesser General Public License v3.0 only (`LGPL-3.0-only`)** — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

- Original feature authored by `lpmasser` ([BytePioneer-AI/codex-host#926](https://github.com/BytePioneer-AI/codex-host/pull/926)).
- Desktop Extension v1 adaptation originally prepared by `BytePioneer-AI/codex-host` contributors (`handoff/desktop-extensions-926-947`).
