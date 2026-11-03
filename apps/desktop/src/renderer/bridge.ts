import type { DesktopApi } from "../shared";
import { createMockBridge } from "./dev-mock";
export const isMock =
  import.meta.env.VITE_MOCK_DESKTOP === "1" ||
  !window.desktop?.invoke ||
  !window.desktop?.onChatEvent;
export const desktop: DesktopApi = isMock ? createMockBridge() : window.desktop;
