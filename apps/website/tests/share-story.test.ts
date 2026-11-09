import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareStoryLayout, type ShareData } from '../src/scripts/share-story-layout.ts';
import { mediaCopy } from '../src/data/media-copy.ts';
const palette = {sky:'#afd2ff',iris:'#cda5f5',accent:'#5546a3',ink:'#18181b',paper:'#fafafa'};
for (const [language,c] of Object.entries(mediaCopy)) {
  for (const format of ['story','square'] as const) for (const look of ['light','dark','aurora'] as const) {
    const data: ShareData = {format,look,headline:c.headline,chips:c.chips,free:c.free,url:'https://vstudy.vcstudio.app/download',version:'v0.4.4 beta',palette};
    test(`${language} ${format} ${look} exports complete content within its bounds`,() => {
      const layout = shareStoryLayout(data);
      assert.equal(layout.width,1080);
      assert.equal(layout.height,format === 'story' ? 1920 : 1080);
      assert.deepEqual(layout,shareStoryLayout(data));
      const texts = layout.commands.filter(c => c.kind === 'text');
      for (const value of [...c.headline,...c.chips,c.free,'vstudy.vcstudio.app/download','v0.4.4 beta']) assert.ok(texts.some(c => c.text === value),value);
      assert.equal(layout.commands.filter(c => c.kind === 'image').length,2);
      for (const command of layout.commands) {
        assert.ok(command.x >= 0 && command.y >= 0);
        if (command.kind === 'text') {
          assert.ok(command.y+command.size <= layout.height,command.text);
          assert.ok(command.x+command.maxWidth <= layout.width,command.text);
        } else {
          assert.ok(command.x+command.width <= layout.width);
          assert.ok(command.y+command.height <= layout.height);
        }
      }
      assert.equal(layout.commands.some(c => c.kind === 'gradient'),look === 'aurora');
    });
  }
}
test('screenshot retains its full 16:10 aspect ratio and clears chips and footer',() => {
  for (const format of ['story','square'] as const) {
    const c = mediaCopy.en;
    const {commands} = shareStoryLayout({format,look:'light',headline:c.headline,chips:c.chips,free:c.free,url:'https://vstudy.vcstudio.app/download',version:'v0.4.4 beta',palette});
    const shot = commands.find(c => c.kind === 'image' && c.source === 'screenshot')!;
    assert.ok(shot.kind === 'image');
    assert.equal(shot.width/shot.height,1.6);
    const footer = commands.find(cmd => cmd.kind === 'text' && cmd.text === c.free)!;
    assert.ok(shot.y+shot.height < footer.y);
    assert.ok(shot.y > (format === 'story' ? 708 : 450));
  }
});
