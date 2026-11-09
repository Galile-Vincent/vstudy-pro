export type ShareFormat = 'story' | 'square';
export type ShareLook = 'light' | 'dark' | 'aurora';
export interface ShareData {
  format: ShareFormat; look: ShareLook; headline: readonly [string,string];
  chips: readonly [string,string,string]; free: string; url: string; version: string;
  palette: { sky: string; iris: string; accent: string; ink: string; paper: string };
}
type Box = { x: number; y: number; width: number; height: number };
export type DrawCommand =
  | ({ kind: 'rect'; fill: string; radius: number } & Box)
  | ({ kind: 'gradient'; colors: string[] } & Box)
  | ({ kind: 'image'; source: 'symbol' | 'screenshot'; radius: number } & Box)
  | { kind: 'text'; text: string; x: number; y: number; size: number; weight: number; color: string; maxWidth: number };
export function shareStoryLayout(data: ShareData): { width: number; height: number; commands: DrawCommand[] } {
  const story = data.format === 'story';
  const height = story ? 1920 : 1080;
  const dark = data.look === 'dark';
  const ink = dark ? '#f4f4f5' : data.palette.ink;
  const muted = dark ? '#ababB4' : '#606068';
  const commands: DrawCommand[] = [];
  const rect = (x: number,y: number,width: number,h: number,fill: string,radius = 0) => commands.push({kind:'rect',x,y,width,height:h,fill,radius});
  const text = (value: string,x: number,y: number,size: number,weight = 500,color = ink,maxWidth = 1008-x) => commands.push({kind:'text',text:value,x,y,size,weight,color,maxWidth});
  rect(0,0,1080,height,dark ? '#0b0b0d' : data.palette.paper);
  if (data.look === 'aurora') commands.push({kind:'gradient',x:0,y:0,width:1080,height,colors:[data.palette.sky,'#f3edff',data.palette.iris]});
  const top = story ? 144 : 56;
  commands.push({kind:'image',source:'symbol',x:72,y:top,width:104,height:82,radius:0});
  rect(137,top+66,64,27,dark ? '#bdb0ff' : data.palette.accent,13);
  text('beta',148,top+70,18,600,dark ? '#181320' : '#ffffff',46);
  text('VStudy Pro',224,top+22,38,650);
  const headY = story ? 370 : 200;
  data.headline.forEach((line,i) => text(line,72,headY+i*(story ? 106 : 82),story ? 90 : 70,700));
  const chipY = story ? 650 : 392;
  data.chips.forEach((chip,i) => {
    rect(72+i*316,chipY,300,58,dark ? '#24242b' : '#ffffff',29);
    text(chip,90+i*316,chipY+16,25,550,ink,264);
  });
  const screen = story ? {x:72,y:854,width:936,height:585} : {x:240,y:496,width:600,height:375};
  rect(screen.x-12,screen.y-12,screen.width+24,screen.height+24,dark ? '#39393f' : '#dddce8',32);
  commands.push({kind:'image',source:'screenshot',...screen,radius:20});
  const footerY = story ? 1610 : 930;
  text(data.free,72,footerY,story ? 50 : 36,650);
  text(data.url.replace(/^https:\/\//,''),72,footerY+70,30,500,ink);
  text(data.version,72,story ? 1790 : 1040,22,500,muted);
  return {width:1080,height,commands};
}
