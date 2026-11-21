/*! codexhost-sidebar-delegation-badges | Copyright (c) 2026 lpmasser & BytePioneer-AI/codex-host contributors | LGPL-3.0-only */
"use strict";
(() => {
  // src/badges.ts
  var SIDEBAR_AGENT_ICON_ATTRIBUTE = "data-codexhost-sidebar-agent-icon";
  var SIDEBAR_AGENT_ICON_SELECTOR = `[${SIDEBAR_AGENT_ICON_ATTRIBUTE}]`;
  var EXTENSION_NODE_ATTRIBUTE = "data-cx-extension-node";
  var BADGE_ATTRIBUTE = "data-codexhost-delegation-badge";
  var POPOVER_ATTRIBUTE = "data-codexhost-delegation-popover";
  var CHILD_ATTRIBUTE = "data-codexhost-delegation-child";
  var POPOVER_MAX_HEIGHT = 320;
  var POPOVER_MAX_WIDTH = 360;
  var POPOVER_GAP = 4;
  var VIEWPORT_MARGIN = 8;
  var PRESS_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup"];
  var STATE_PRIORITY = {
    waiting: 0,
    running: 1,
    unknown: 2,
    idle: 3
  };
  var STATE_LABEL = {
    waiting: "\u5F85\u56DE\u7B54",
    running: "\u8FD0\u884C\u4E2D",
    unknown: "\u72B6\u6001\u672A\u77E5",
    idle: "\u65E0\u6D3B\u52A8"
  };
  var STATE_GLYPH = {
    waiting: "?",
    running: "\u25CF",
    unknown: "\u25CC",
    idle: "\u25CB"
  };
  function delegationBadgeState(children) {
    return children.reduce(
      (state, child) => STATE_PRIORITY[child.status] < STATE_PRIORITY[state] ? child.status : state,
      "idle"
    );
  }
  function markExtensionNode(node) {
    node.setAttribute(EXTENSION_NODE_ATTRIBUTE, "");
    return node;
  }
  function findSidebarAgentIcon(rowElement) {
    const icon = rowElement.querySelector(SIDEBAR_AGENT_ICON_SELECTOR);
    return icon && rowElement.contains(icon) ? icon : null;
  }
  function collectSidebarIcons(rows) {
    const icons = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!row.isConnected()) continue;
      const iconHost = findSidebarAgentIcon(row.element);
      if (!iconHost) continue;
      const harnessId = iconHost.getAttribute(SIDEBAR_AGENT_ICON_ATTRIBUTE);
      if (!harnessId || icons.has(harnessId)) continue;
      const graphic = iconHost.querySelector(":scope > img, :scope > svg");
      if (graphic) icons.set(harnessId, graphic);
    }
    return icons;
  }
  function harnessLabel(api, harnessId) {
    return api.harnesses.describe(harnessId)?.name ?? (harnessId === "codex" ? "Codex" : harnessId);
  }
  function createAgentIcon(api, doc, harnessId, sidebarIcons) {
    const wrap = doc.createElement("span");
    wrap.className = "cx-delegation-icon";
    wrap.setAttribute("aria-hidden", "true");
    const described = api.harnesses.describe(harnessId);
    if (described?.icon) {
      const img = doc.createElement("img");
      img.src = described.icon;
      img.alt = "";
      img.draggable = false;
      wrap.append(img);
      return wrap;
    }
    const sampled = sidebarIcons.get(harnessId);
    if (sampled) {
      const tag = sampled.tagName.toLowerCase();
      if (tag === "img") {
        const src = sampled.getAttribute("src");
        if (src) {
          const img = doc.createElement("img");
          img.src = src;
          img.alt = "";
          img.draggable = false;
          wrap.append(img);
          return wrap;
        }
      } else if (tag === "svg") {
        const clone = sampled.cloneNode(true);
        clone.style.width = "14px";
        clone.style.height = "14px";
        clone.style.flex = "none";
        wrap.append(clone);
        return wrap;
      }
    }
    wrap.classList.add("cx-delegation-icon-fallback");
    wrap.textContent = harnessLabel(api, harnessId).slice(0, 1).toUpperCase();
    return wrap;
  }
  function byUrgency(list) {
    return [...list].sort(
      (left, right) => STATE_PRIORITY[left.status] - STATE_PRIORITY[right.status]
    );
  }
  function createRowIconObserver(api, onRelevantMutation) {
    const observers = /* @__PURE__ */ new Map();
    let scheduled = false;
    const isExtensionOnlyNode = (node) => node instanceof Element && (node.hasAttribute(EXTENSION_NODE_ATTRIBUTE) || Boolean(node.closest(`[${EXTENSION_NODE_ATTRIBUTE}]`)));
    const isRelevant = (mutations) => {
      for (const mutation of mutations) {
        if (isExtensionOnlyNode(mutation.target)) continue;
        for (const node of mutation.addedNodes) {
          if (!isExtensionOnlyNode(node)) return true;
        }
        for (const node of mutation.removedNodes) {
          if (!isExtensionOnlyNode(node)) return true;
        }
      }
      return false;
    };
    const schedule = () => {
      if (scheduled || api.signal.aborted) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (api.signal.aborted) return;
        onRelevantMutation();
      });
    };
    const disconnect = () => {
      for (const observer of observers.values()) observer.disconnect();
      observers.clear();
    };
    api.track(disconnect);
    api.signal.addEventListener("abort", disconnect, { once: true });
    return {
      sync(targets) {
        if (api.signal.aborted) return;
        for (const [element, observer] of observers) {
          if (targets.has(element) && element.isConnected) continue;
          observer.disconnect();
          observers.delete(element);
        }
        for (const element of targets) {
          if (observers.has(element) || !element.isConnected) continue;
          const view = element.ownerDocument.defaultView;
          const ObserverCtor = view?.MutationObserver ?? globalThis.MutationObserver;
          if (!ObserverCtor) continue;
          const observer = new ObserverCtor((mutations) => {
            if (api.signal.aborted) return;
            if (isRelevant(mutations)) schedule();
          });
          observer.observe(element, { childList: true, subtree: true });
          observers.set(element, observer);
        }
      },
      disconnect
    };
  }
  function activate(api) {
    let rows = [];
    let childrenByParent = /* @__PURE__ */ new Map();
    let treeTruncated = false;
    const badgesByRow = /* @__PURE__ */ new Map();
    let markedIcons = /* @__PURE__ */ new Set();
    let popover = null;
    const closePopover = () => {
      popover?.close();
      popover = null;
    };
    const itemsIn = (element) => [
      ...element.querySelectorAll(`[${CHILD_ATTRIBUTE}]`)
    ];
    const placePopover = (element, anchor) => {
      const view = element.ownerDocument.defaultView;
      if (!view) return;
      element.style.maxWidth = `${Math.min(POPOVER_MAX_WIDTH, view.innerWidth - 2 * VIEWPORT_MARGIN)}px`;
      const rect = anchor.getBoundingClientRect();
      const below = view.innerHeight - rect.bottom - POPOVER_GAP - VIEWPORT_MARGIN;
      const above = rect.top - POPOVER_GAP - VIEWPORT_MARGIN;
      const wanted = Math.min(POPOVER_MAX_HEIGHT, element.scrollHeight);
      const upward = below < wanted && above > below;
      Object.assign(element.style, {
        maxHeight: `${Math.max(0, Math.min(POPOVER_MAX_HEIGHT, upward ? above : below))}px`,
        top: upward ? "auto" : `${Math.round(rect.bottom + POPOVER_GAP)}px`,
        bottom: upward ? `${Math.round(view.innerHeight - rect.top + POPOVER_GAP)}px` : "auto",
        left: `${Math.round(
          Math.max(
            VIEWPORT_MARGIN,
            Math.min(rect.left, view.innerWidth - VIEWPORT_MARGIN - element.offsetWidth)
          )
        )}px`
      });
    };
    const isActiveBadgeForParent = (parentThreadId, anchor) => {
      if (!anchor.isConnected) return false;
      for (const [rowElement, badge] of badgesByRow) {
        if (badge.button !== anchor) continue;
        return badge.threadId === parentThreadId && rowElement.isConnected && badge.icon.isConnected && badge.button.parentElement === badge.icon;
      }
      return false;
    };
    const renderPopoverItems = (element, list, sidebarIcons, onSelectChild, resetItemsSignal) => {
      const doc = element.ownerDocument;
      const ordered = byUrgency(list);
      const titleOf = (child) => child.title?.trim() ? child.title : harnessLabel(api, child.harnessId);
      const presentation = JSON.stringify([
        treeTruncated,
        ordered.map((child) => {
          const described = api.harnesses.describe(child.harnessId);
          return [
            child.threadId,
            child.status,
            titleOf(child),
            child.harnessId,
            described?.name ?? null,
            described?.icon ?? null,
            sidebarIcons.has(child.harnessId)
          ];
        })
      ]);
      if (element.getAttribute(POPOVER_ATTRIBUTE) === presentation) return;
      element.setAttribute(POPOVER_ATTRIBUTE, presentation);
      const focused = doc.activeElement?.closest(`[${CHILD_ATTRIBUTE}]`)?.getAttribute(CHILD_ATTRIBUTE);
      const itemsSignal = resetItemsSignal();
      element.replaceChildren();
      for (const child of ordered) {
        const state = child.status;
        const item = doc.createElement("button");
        item.type = "button";
        item.className = "cx-delegation-item";
        item.setAttribute("role", "menuitem");
        item.setAttribute(CHILD_ATTRIBUTE, child.threadId);
        const icon = createAgentIcon(api, doc, child.harnessId, sidebarIcons);
        const title = doc.createElement("span");
        title.className = "cx-delegation-title";
        title.textContent = titleOf(child);
        const status = doc.createElement("span");
        status.className = "cx-delegation-status";
        status.dataset.state = state;
        status.textContent = `${STATE_GLYPH[state]} ${STATE_LABEL[state]}`;
        item.append(icon, title, status);
        item.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelectChild(child.threadId);
          },
          { signal: itemsSignal }
        );
        element.append(item);
        if (child.threadId === focused) item.focus();
      }
      if (treeTruncated) {
        const note = doc.createElement("div");
        note.className = "cx-delegation-truncated";
        note.textContent = "\u4F1A\u8BDD\u6811\u5DF2\u622A\u65AD\uFF0C\u5217\u8868\u53EF\u80FD\u4E0D\u5B8C\u6574";
        element.append(note);
      }
    };
    const openPopover = (anchor, parentThreadId, byKeyboard) => {
      if (api.signal.aborted || !isActiveBadgeForParent(parentThreadId, anchor)) return;
      closePopover();
      let list = childrenByParent.get(parentThreadId);
      if (!list?.length) return;
      const doc = anchor.ownerDocument;
      const element = markExtensionNode(doc.createElement("div"));
      element.className = "cx-delegation-popover";
      element.setAttribute(POPOVER_ATTRIBUTE, "");
      element.setAttribute("role", "menu");
      const popoverAbort = new AbortController();
      let itemsAbort = null;
      const resetItemsSignal = () => {
        itemsAbort?.abort();
        itemsAbort = new AbortController();
        return itemsAbort.signal;
      };
      let currentAnchor = anchor;
      currentAnchor.setAttribute("aria-expanded", "true");
      const onSelectChild = (childThreadId) => {
        const stillValid = !api.signal.aborted && popover === opened && isActiveBadgeForParent(parentThreadId, currentAnchor) && Boolean(
          childrenByParent.get(parentThreadId)?.some((entry) => entry.threadId === childThreadId)
        );
        closePopover();
        if (!stillValid) return;
        void api.navigate.openThread(childThreadId).catch((error) => {
          if (!api.signal.aborted) {
            console.error("codexhost could not open the delegated Thread", error);
          }
        });
      };
      const renderList = (sidebarIcons) => {
        renderPopoverItems(element, list ?? [], sidebarIcons, onSelectChild, resetItemsSignal);
        placePopover(element, currentAnchor);
      };
      const onPointerDown = (event) => {
        if (!(event.target instanceof Node) || !element.contains(event.target)) {
          closePopover();
        }
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          const returnFocus = element.contains(doc.activeElement);
          closePopover();
          if (returnFocus && currentAnchor.isConnected) currentAnchor.focus();
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const entries = itemsIn(element);
        const index = entries.findIndex((entry) => entry === doc.activeElement);
        if (index < 0) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        entries[(index + step + entries.length) % entries.length]?.focus();
      };
      const onScroll = (event) => {
        const target = event.target;
        if (target === doc || target instanceof Node && target.contains(currentAnchor)) {
          closePopover();
        }
      };
      const onVisibilityChange = () => {
        if (doc.visibilityState === "hidden") closePopover();
      };
      const onResize = () => {
        if (!isActiveBadgeForParent(parentThreadId, currentAnchor)) {
          closePopover();
          return;
        }
        placePopover(element, currentAnchor);
      };
      doc.addEventListener("pointerdown", onPointerDown, {
        capture: true,
        signal: popoverAbort.signal
      });
      doc.addEventListener("keydown", onKeyDown, {
        capture: true,
        signal: popoverAbort.signal
      });
      doc.addEventListener("scroll", onScroll, {
        capture: true,
        signal: popoverAbort.signal
      });
      doc.addEventListener("visibilitychange", onVisibilityChange, {
        signal: popoverAbort.signal
      });
      doc.defaultView?.addEventListener("resize", onResize, {
        signal: popoverAbort.signal
      });
      api.dom.mount(element, doc.body, "append");
      const opened = {
        parentThreadId,
        get anchor() {
          return currentAnchor;
        },
        setAnchor(nextAnchor) {
          if (currentAnchor === nextAnchor) return;
          currentAnchor.setAttribute("aria-expanded", "false");
          currentAnchor = nextAnchor;
          currentAnchor.setAttribute("aria-expanded", "true");
          placePopover(element, currentAnchor);
        },
        update(next, sidebarIcons) {
          list = next;
          renderList(sidebarIcons);
        },
        close() {
          itemsAbort?.abort();
          itemsAbort = null;
          popoverAbort.abort();
          currentAnchor.setAttribute("aria-expanded", "false");
          element.remove();
        }
      };
      popover = opened;
      renderList(collectSidebarIcons(rows));
      if (byKeyboard) itemsIn(element)[0]?.focus();
    };
    const unmountBadge = (rowElement) => {
      const existing = badgesByRow.get(rowElement);
      if (!existing) return;
      existing.dispose();
      badgesByRow.delete(rowElement);
    };
    const createBadge = (icon, threadId, presentation) => {
      const doc = icon.ownerDocument;
      const badgeAbort = new AbortController();
      const button = markExtensionNode(doc.createElement("button"));
      button.type = "button";
      button.className = "cx-delegation-badge";
      button.setAttribute(BADGE_ATTRIBUTE, presentation);
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      const count = doc.createElement("span");
      count.className = "cx-delegation-count";
      button.append(count);
      const open = (event, byKeyboard) => {
        event.preventDefault();
        event.stopPropagation();
        openPopover(button, current.threadId, byKeyboard);
      };
      const swallow = (event) => {
        event.stopPropagation();
      };
      const onClick = (event) => open(event, false);
      const onKeyDown = (event) => {
        if (event.key === "Enter" || event.key === " ") open(event, true);
      };
      for (const type of PRESS_EVENTS) {
        button.addEventListener(type, swallow, { signal: badgeAbort.signal });
      }
      button.addEventListener("click", onClick, { signal: badgeAbort.signal });
      button.addEventListener("keydown", onKeyDown, { signal: badgeAbort.signal });
      api.dom.mount(button, icon, "append");
      const current = {
        icon,
        button,
        count,
        threadId,
        presentation,
        dispose() {
          badgeAbort.abort();
          button.remove();
        }
      };
      return current;
    };
    const render = () => {
      if (api.signal.aborted) return;
      const visibleRows = /* @__PURE__ */ new Set();
      const observedRows = /* @__PURE__ */ new Set();
      const nextMarkedIcons = /* @__PURE__ */ new Set();
      const activeBadgesByThread = /* @__PURE__ */ new Map();
      const sidebarIcons = collectSidebarIcons(rows);
      for (const row of rows) {
        if (!row.isLocal || !row.threadId || !row.isConnected()) continue;
        const list = childrenByParent.get(row.threadId);
        if (!list?.length) continue;
        observedRows.add(row.element);
        const icon = findSidebarAgentIcon(row.element);
        if (!icon) continue;
        visibleRows.add(row.element);
        nextMarkedIcons.add(icon);
        const state = delegationBadgeState(list);
        const presentation = `${row.threadId}:${list.length}:${state}:${treeTruncated ? "1" : "0"}`;
        let badge = badgesByRow.get(row.element);
        if (badge && (badge.icon !== icon || badge.button.parentElement !== icon || badge.threadId !== row.threadId)) {
          unmountBadge(row.element);
          badge = void 0;
        }
        if (!badge) {
          badge = createBadge(icon, row.threadId, presentation);
          badgesByRow.set(row.element, badge);
        } else if (badge.presentation === presentation) {
          activeBadgesByThread.set(row.threadId, badge);
          continue;
        } else {
          badge.threadId = row.threadId;
          badge.presentation = presentation;
          badge.button.setAttribute(BADGE_ATTRIBUTE, presentation);
        }
        activeBadgesByThread.set(row.threadId, badge);
        const originalLabel = icon.getAttribute("aria-label") ?? "";
        const label = `${originalLabel} \xB7 \u5DF2\u6D3E\u51FA ${list.length} \u4E2A\u4F1A\u8BDD${state === "idle" ? "" : `\uFF0C\u6709\u4F1A\u8BDD${STATE_LABEL[state]}`}${treeTruncated ? "\uFF08\u5217\u8868\u53EF\u80FD\u4E0D\u5B8C\u6574\uFF09" : ""}`;
        badge.button.setAttribute("aria-label", label);
        badge.button.title = label;
        badge.count.dataset.state = state;
        badge.count.textContent = list.length > 9 ? "9+" : String(list.length);
      }
      for (const icon of markedIcons) {
        if (!nextMarkedIcons.has(icon)) api.dom.unmark(icon, "anchor");
      }
      for (const icon of nextMarkedIcons) {
        if (!markedIcons.has(icon)) api.dom.mark(icon, "anchor");
      }
      markedIcons = nextMarkedIcons;
      for (const rowElement of [...badgesByRow.keys()]) {
        if (!visibleRows.has(rowElement)) unmountBadge(rowElement);
      }
      if (popover) {
        const list = childrenByParent.get(popover.parentThreadId);
        const activeBadge = activeBadgesByThread.get(popover.parentThreadId);
        if (!list?.length || !activeBadge || !activeBadge.button.isConnected) {
          closePopover();
        } else {
          if (popover.anchor !== activeBadge.button) {
            popover.setAnchor(activeBadge.button);
          }
          popover.update(list, sidebarIcons);
        }
      }
      iconObserver.sync(observedRows);
    };
    const iconObserver = createRowIconObserver(api, render);
    const cleanup = () => {
      closePopover();
      iconObserver.disconnect();
      for (const rowElement of [...badgesByRow.keys()]) unmountBadge(rowElement);
      if (!api.signal.aborted) {
        for (const icon of markedIcons) api.dom.unmark(icon, "anchor");
      }
      markedIcons.clear();
    };
    api.signal.addEventListener("abort", cleanup, { once: true });
    api.sidebar.observeRows((current) => {
      rows = current;
      render();
    });
    api.threads.watchTree(({ nodes, parents, truncated }) => {
      treeTruncated = truncated;
      const next = /* @__PURE__ */ new Map();
      const nodeById = new Map(Object.entries(nodes));
      for (const [childId, parentId] of Object.entries(parents)) {
        const child = nodeById.get(childId);
        const parent = nodeById.get(parentId);
        if (!child || child.archived || !parent || parent.archived) continue;
        const list = next.get(parentId) ?? [];
        list.push({
          threadId: childId,
          harnessId: child.harnessId,
          title: child.title,
          status: child.status
        });
        next.set(parentId, list);
      }
      childrenByParent = next;
      render();
    });
    return cleanup;
  }

  // src/index.ts
  define({ activate });
})();
