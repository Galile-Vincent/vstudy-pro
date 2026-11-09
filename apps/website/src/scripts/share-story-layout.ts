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
  | ({ kind: 'image'; source: 'symbol' | 'screenshot'; radius: number; crop?: Box } & Box)
  | { kind: 'text'; text: string; x: number; y: number; size: number; weight: number; color: string; maxWidth: number; align: 'left' | 'center' };
export function shareStoryLayout(data: ShareData): { width: number; height: number; commands: DrawCommand[] } {
  const story = data.format === 'story';
  const height = story ? 1920 : 1080;
  const dark = data.look === 'dark';
  const ink = dark ? '#f4f4f5' : data.palette.ink;
  const accent = dark ? '#cbbaff' : data.palette.accent;
  const muted = dark ? '#b9b9c4' : '#41394f';
  const commands: DrawCommand[] = [];
  const rect = (x: number,y: number,width: number,h: number,fill: string,radius = 0) => commands.push({kind:'rect',x,y,width,height:h,fill,radius});
  const text = (value: string,x: number,y: number,size: number,weight = 500,color = ink,maxWidth = 1008-x,align: 'left' | 'center' = 'left') => commands.push({kind:'text',text:value,x,y,size,weight,color,maxWidth,align});
  rect(0,0,1080,height,dark ? '#101014' : data.palette.paper);
  if (data.look === 'aurora') {
    commands.push({kind:'gradient',x:0,y:0,width:1080,height,colors:[data.palette.sky,'#d6cafa',data.palette.iris]});
    rect(540,story ? 260 : 100,680,680,'#ffffff24',340);
  }
  const top = story ? 128 : 48;
  commands.push({kind:'image',source:'symbol',x:64,y:top,width:104,height:82,radius:0});
  rect(129,top+66,64,27,accent,13);
  text('beta',129,top+70,18,600,dark ? '#181320' : '#ffffff',64,'center');
  text('VStudy Pro',208,top+22,36,650);
  const headY = story ? 310 : 190;
  data.headline.forEach((line,i) => text(line,64,headY+i*(story ? 116 : 88),story ? 100 : 76,750,i === 1 ? accent : ink,952));
  const chipY = story ? 592 : 390;
  data.chips.forEach((chip,i) => {
    const x = 64+i*322;
    rect(x,chipY,308,64,dark ? '#26232f' : '#ffffff',32);
    rect(x+20,chipY+27,10,10,accent,5);
    text(chip,x+44,chipY+20,25,550,ink,246);
  });
  // Normalized crops preserve the source's 16:10 ratio while enlarging the course rows.
  const crop = story ? {x:0.035,y:0.09,width:0.66,height:0.76} : {x:0.035,y:0.19,width:0.80,height:0.43};
  const screen = {x:64,y:story ? 736 : 494,width:story ? 1170 : 1200,height:(story ? 1170 : 1200)*crop.height/(1.6*crop.width)};
  rect(screen.x-12,screen.y+12,screen.width+24,screen.height+24,dark ? '#00000066' : '#30204a20',40);
  rect(screen.x-8,screen.y-8,screen.width+16,screen.height+16,dark ? '#51485f' : '#ffffff',36);
  commands.push({kind:'image',source:'screenshot',...screen,crop,radius:28});
  const footerY = story ? 1664 : 938;
  const buttonWidth = story ? 490 : 390;
  const buttonHeight = story ? 96 : 66;
  rect(64,footerY,buttonWidth,buttonHeight,accent,buttonHeight/2);
  text(data.free,88,footerY+(story ? 26 : 17),story ? 42 : 30,650,dark ? '#181320' : '#ffffff',buttonWidth-48,'center');
  text(data.url.replace(/^https:\/\//,''),64,footerY+buttonHeight+20,story ? 28 : 24,550,ink,700);
  text(data.version,story ? 64 : 790,story ? 1840 : 1028,22,500,muted,story ? 700 : 226);
  return {width:1080,height,commands};
}
