import type { DesktopApi } from "../shared";
declare global {
  interface Window {
    desktop: DesktopApi;
  }
}
