import { createRequire } from 'node:module';
import { existsSync, copyFileSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

if (process.platform === 'darwin') {
  const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
  let root;
  try { root = dirname(require.resolve('electron/package.json')); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    console.log('Dev branding skipped: Electron package is not installed.');
    process.exit(0);
  }
  const originalBundle = join(root, 'dist/Electron.app');
  const bundle = join(root, 'dist/VStudy Pro.app');
  if (existsSync(originalBundle)) renameSync(originalBundle, bundle);
  const plist = join(bundle, 'Contents/Info.plist');
  if (!existsSync(plist)) console.log('Dev branding skipped: Electron bundle is not installed.');
  else {
    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} VStudy Pro`, plist]);
    }
    const oldExecutable = join(bundle, 'Contents/MacOS/Electron');
    if (existsSync(oldExecutable)) renameSync(oldExecutable, join(bundle, 'Contents/MacOS/VStudy Pro'));
    execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleExecutable VStudy Pro', plist]);
    const frameworks = join(bundle, 'Contents/Frameworks');
    for (const entry of readdirSync(frameworks).filter(name => name.endsWith('.app'))) {
      const name = entry.slice(0, -4).replace(/^Electron/, 'VStudy Pro');
      const helper = join(frameworks, `${name}.app`);
      if (helper !== join(frameworks, entry)) renameSync(join(frameworks, entry), helper);
      const helperPlist = join(helper, 'Contents/Info.plist');
      const [executable] = readdirSync(join(helper, 'Contents/MacOS'));
      if (executable !== name) renameSync(join(helper, 'Contents/MacOS', executable), join(helper, 'Contents/MacOS', name));
      for (const key of ['CFBundleName', 'CFBundleDisplayName', 'CFBundleExecutable']) {
        execFileSync('/usr/bin/plutil', ['-replace', key, '-string', name, helperPlist]);
      }
    }
    const pathFile = join(root, 'path.txt');
    writeFileSync(pathFile, readFileSync(pathFile, 'utf8').replace('Electron.app/', 'VStudy Pro.app/').replace('Contents/MacOS/Electron', 'Contents/MacOS/VStudy Pro'));
    const icon = new URL('../apps/desktop/build/icon.icns', import.meta.url);
    copyFileSync(icon, join(bundle, 'Contents/Resources/electron.icns'));
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'pipe' });
    console.log('Dev Electron bundle branded VStudy Pro. Bundle identifier and data identities retained.');
  }
}
