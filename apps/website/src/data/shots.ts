/** Real app captures. Astro emits smaller website derivatives from the 2x marketing originals. */
import type { ImageMetadata } from 'astro';
const images = import.meta.glob<{default: ImageMetadata}>('../assets/shots/*.webp', {eager:true});
const aliases: Record<string,string> = {reader:'reader-chat-with-answer',courses:'courses-home',course:'course-page',planner:'planner-today',history:'history-search',themes:'themes-settings',moodle:'moodle-webview',onboarding:'onboarding-welcome'};
export function shot(name: string): ImageMetadata {
  const image = images[`../assets/shots/${aliases[name] ?? name}.webp`]?.default;
  if (!image) throw new Error(`Missing marketing shot ${name}. Run the desktop marketing pipeline.`);
  return image;
}
