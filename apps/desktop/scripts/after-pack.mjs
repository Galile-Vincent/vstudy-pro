
/** Apply the same hardened fuses to native Mac and Windows package layouts before signing. */
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export function fuseTarget({ appOutDir, packager, electronPlatformName }) {
  const name = packager.appInfo.productFilename;
  if (electronPlatformName === 'darwin') return join(appOutDir, `${name}.app`);
  if (electronPlatformName === 'win32') return join(appOutDir, `${name}.exe`);
  throw new Error(`Unsupported fuse platform ${electronPlatformName}`);
}

export default async context => {
  const { flipFuses, FuseVersion, FuseV1Options: F } = await import('@electron/fuses');
  const target = fuseTarget(context);
  if (context.electronPlatformName === 'darwin') {
    const frameworks = join(target, 'Contents/Frameworks');
    for (const helper of readdirSync(frameworks).filter(name => name.endsWith('.app'))) {
      const plist = join(frameworks, helper, 'Contents/Info.plist');
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleName ${helper.slice(0, -4)}`, plist]);
    }
  }
  await flipFuses(target, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: context.electronPlatformName === 'darwin',
    [F.RunAsNode]: false,
    [F.EnableNodeOptionsEnvironmentVariable]: false,
    [F.EnableNodeCliInspectArguments]: false,
    // The renderer uses no cookies. Chromium OSCrypt otherwise reads Safe Storage before ready.
    // This fuse does not disable safeStorage encryption for explicitly saved API keys.
    [F.EnableCookieEncryption]: false,
    [F.OnlyLoadAppFromAsar]: true,
    [F.EnableEmbeddedAsarIntegrityValidation]: true,
    [F.GrantFileProtocolExtraPrivileges]: false,
  });
  if (context.electronPlatformName === 'darwin' && process.platform === 'darwin' &&
      !process.env.CSC_LINK && !process.env.CSC_NAME && !context.packager.platformSpecificBuildOptions.identity) {
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', target]);
  }
};
