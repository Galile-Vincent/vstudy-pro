
export default async ({ appOutDir, packager }) => {
  const { join } = await import('node:path');
  const { flipFuses, FuseVersion, FuseV1Options: F } = await import('@electron/fuses');
  await flipFuses(join(appOutDir, `${packager.appInfo.productFilename}.app`), {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: true,
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
  if (!process.env.CSC_LINK && !process.env.CSC_NAME && !packager.platformSpecificBuildOptions.identity) {
    const { execFileSync } = await import('node:child_process');
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', join(appOutDir, `${packager.appInfo.productFilename}.app`)]);
  }
};
