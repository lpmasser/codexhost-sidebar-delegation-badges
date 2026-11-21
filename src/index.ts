import type { DesktopExtensionDefine } from "./api.js";
import { activate } from "./badges.js";

declare const define: DesktopExtensionDefine;

define({ activate });
