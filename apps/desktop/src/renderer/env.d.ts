import type { DesktopApi } from "../shared";
declare global {
  const __APP_VERSION__: string;
  interface Window {
    desktop: DesktopApi;
  }
}
