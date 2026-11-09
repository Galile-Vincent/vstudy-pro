import { shareStoryLayout, type ShareData, type DrawCommand, type ShareFormat, type ShareLook } from './share-story-layout';
import type { MediaCopy } from '../data/media-copy';

function paint(ctx: CanvasRenderingContext2D, commands: DrawCommand[], images: Record<'symbol' | 'screenshot', HTMLImageElement>) {
  for (const command of commands) {
    ctx.save();
    if (command.kind === 'text') {
      ctx.font = `${command.weight} ${command.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillStyle = command.color;
      ctx.textBaseline = 'top';
      const width = ctx.measureText(command.text).width;
      if (width > command.maxWidth) {
        ctx.font = `${command.weight} ${command.size * command.maxWidth / width}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      }
      const measured = ctx.measureText(command.text).width;
      const x = command.align === 'center' ? command.x + (command.maxWidth-measured)/2 : command.x;
      ctx.fillText(command.text, x, command.y);
    } else if (command.kind === 'gradient') {
      const gradient = ctx.createLinearGradient(0,0,command.width,command.height);
      command.colors.forEach((color,i) => gradient.addColorStop(i/(command.colors.length-1),color));
      ctx.fillStyle = gradient;
      ctx.fillRect(command.x,command.y,command.width,command.height);
    } else {
      ctx.beginPath();
      ctx.roundRect(command.x,command.y,command.width,command.height,command.radius);
      if (command.kind === 'rect') {
        ctx.fillStyle = command.fill;
        ctx.fill();
      } else {
        ctx.clip();
        const image = images[command.source];
        if (command.crop) {
          const crop = command.crop;
          ctx.drawImage(image,crop.x*image.naturalWidth,crop.y*image.naturalHeight,crop.width*image.naturalWidth,crop.height*image.naturalHeight,command.x,command.y,command.width,command.height);
        } else {
          ctx.drawImage(image,command.x,command.y,command.width,command.height);
        }
      }
    }
    ctx.restore();
  }
}

async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

export async function initShareStory() {
  const root = document.querySelector<HTMLElement>('[data-media]');
  if (!root) return;
  const config = JSON.parse(root.dataset.config!) as { copy: MediaCopy; palette: ShareData['palette']; url: string; version: string; symbol: string; screenshot: string; language: string };
  const c = config.copy;
  const canvas = root.querySelector('canvas')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const download = root.querySelector<HTMLButtonElement>('[data-action="download"]')!;
  const share = root.querySelector<HTMLButtonElement>('[data-action="share"]')!;
  const report = (message: string) => { status.textContent = message; };
  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
    button.addEventListener('click',async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy!); report(c.copied); }
      catch { report(c.error); }
    });
  });
  try {
    const [symbol,screenshot] = await Promise.all([loadImage(config.symbol),loadImage(config.screenshot),document.fonts.ready]);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    let file: File | undefined;
    let revision = 0;
    const redraw = () => {
      const currentRevision = ++revision;
      file = undefined;
      download.disabled = true;
      share.hidden = true;
      const format = root.querySelector<HTMLInputElement>('input[name="format"]:checked')!.value as ShareFormat;
      const look = root.querySelector<HTMLInputElement>('input[name="look"]:checked')!.value as ShareLook;
      const layout = shareStoryLayout({format,look,headline:c.headline,chips:c.chips,free:c.free,url:config.url,version:config.version,palette:config.palette});
      canvas.width = layout.width;
      canvas.height = layout.height;
      paint(ctx,layout.commands,{symbol,screenshot});
      canvas.toBlob(blob => {
        if (currentRevision !== revision) return;
        if (!blob) { report(c.error); return; }
        file = new File([blob],`vstudy-pro-${config.language}-${format}-${look}.png`,{type:'image/png'});
        download.disabled = false;
        share.hidden = !(navigator.canShare?.({files:[file]}) ?? false);
        report(c.ready);
      },'image/png');
    };
    root.querySelectorAll('input[type="radio"]').forEach(input => input.addEventListener('change',redraw));
    download.addEventListener('click',() => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url),60_000);
      report(c.saved);
    });
    share.addEventListener('click',async () => {
      if (!file) return;
      try { await navigator.share({files:[file]}); report(c.ready); }
      catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) report(c.error); }
    });
    redraw();
  } catch { report(c.error); }
}
