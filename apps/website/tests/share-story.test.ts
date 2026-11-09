import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareStoryLayout, type ShareData } from '../src/scripts/share-story-layout.ts';
import { mediaCopy } from '../src/data/media-copy.ts';
const palette = {sky:'#afd2ff',iris:'#cda5f5',accent:'#5546a3',ink:'#18181b',paper:'#fafafa'};
for (const [language,c] of Object.entries(mediaCopy)) {
  for (const format of ['story','square'] as const) for (const look of ['light','dark','aurora'] as const) {
    const data: ShareData = {format,look,headline:c.headline,chips:c.chips,free:c.free,displayUrl:'vstudy.vcstudio.app/download',beta:c.beta,version:`v1.2.3 ${c.beta}`,palette};
    test(`${language} ${format} ${look} exports complete text within its bounds`,() => {
      const layout = shareStoryLayout(data);
      assert.equal(layout.width,1080);
      assert.equal(layout.height,format === 'story' ? 1920 : 1080);
      assert.deepEqual(layout,shareStoryLayout(data));
      const texts = layout.commands.filter(c => c.kind === 'text');
      for (const value of [...c.headline,...c.chips,c.free,'vstudy.vcstudio.app/download',`v1.2.3 ${c.beta}`,c.beta]) assert.ok(texts.some(c => c.text === value),value);
      assert.equal(layout.commands.filter(c => c.kind === 'image').length,2);
      for (const command of layout.commands) {
        assert.ok(command.x >= 0 && command.y >= 0);
        if (command.kind === 'text') {
          const width = [...command.text].reduce((sum,glyph) => sum + command.size * (/[^\u0000-\u024f]/u.test(glyph) ? 1 : 0.6),0);
          assert.ok(width <= command.maxWidth,`${language} ${format} ${command.text}: ${width} > ${command.maxWidth}`);
          assert.ok(command.y+command.size <= layout.height,command.text);
          assert.ok(command.x+command.maxWidth <= layout.width,command.text);
        } else {
          assert.ok(command.width > 0 && command.height > 0);
          assert.ok(command.x < layout.width && command.y < layout.height);
        }
      }
      assert.equal(layout.commands.some(c => c.kind === 'gradient'),look === 'aurora');
    });
  }
}
test('screenshot enlarges course rows without distortion and clears chips and CTA',() => {
  for (const format of ['story','square'] as const) {
    const c = mediaCopy.en;
    const {commands} = shareStoryLayout({format,look:'light',headline:c.headline,chips:c.chips,free:c.free,displayUrl:'vstudy.vcstudio.app/download',beta:c.beta,version:`v1.2.3 ${c.beta}`,palette});
    const shot = commands.find(c => c.kind === 'image' && c.source === 'screenshot')!;
    assert.ok(shot.kind === 'image');
    assert.ok(shot.crop);
    assert.ok(shot.crop.x >= 0 && shot.crop.y >= 0);
    assert.ok(shot.crop.x+shot.crop.width <= 1);
    assert.ok(shot.crop.y+shot.crop.height <= 1);
    assert.ok(Math.abs(shot.width/shot.height - 1.6*shot.crop.width/shot.crop.height) < 0.001);
    assert.ok(shot.width/shot.crop.width > (format === 'story' ? 1700 : 1400));
    assert.ok(shot.x+shot.width > 1080);
    const footer = commands.find(cmd => cmd.kind === 'text' && cmd.text === c.free)!;
    assert.ok(shot.y+shot.height+36 < footer.y);
    const button = commands.find(cmd => cmd.kind === 'rect' && cmd.y === footer.y-(format === 'story' ? 26 : 17));
    assert.ok(button && button.kind === 'rect' && button.radius > 30);
    if (format === 'square') assert.ok(button.y-(shot.y+shot.height+36) >= 60);
    const dots = commands.filter(cmd => cmd.kind === 'rect' && cmd.width === 10 && cmd.height === 10);
    assert.equal(dots.length,3);
    assert.ok(shot.y > (format === 'story' ? 708 : 450));
  }
});

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value,16)/255)
    .map(value => value <= 0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4);
  return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
}

test('overlay text meets AA against each look and gradient stop',() => {
  for (const look of ['light','dark','aurora'] as const) {
    const c = mediaCopy.en;
    const {commands} = shareStoryLayout({format:'story',look,headline:c.headline,chips:c.chips,free:c.free,displayUrl:'vstudy.vcstudio.app/download',beta:c.beta,version:`v1.2.3 ${c.beta}`,palette});
    for (const command of commands) {
      if (command.kind !== 'text') continue;
      const pill = command.text === c.beta || command.text === c.free;
      const chip = c.chips.includes(command.text);
      const backgrounds = pill ? [look === 'dark' ? '#cbbaff' : palette.accent]
        : chip ? [look === 'dark' ? '#26232f' : '#ffffff']
        : look === 'aurora' ? [palette.sky,'#d6cafa',palette.iris]
        : [look === 'dark' ? '#101014' : palette.paper];
      for (const background of backgrounds) {
        const values = [luminance(command.color),luminance(background)].sort((a,b) => b-a);
        const ratio = (values[0]+0.05)/(values[1]+0.05);
        const minimum = command.size >= 24 ? 3 : 4.5;
        assert.ok(ratio >= minimum,`${look} ${command.text} on ${background}: ${ratio}`);
      }
    }
  }
});
