
export default async ({ appOutDir, packager }) => {
  const { join } = await import('node:path');
  const { flipFuses, FuseVersion, FuseV1Options: F } = await import('@electron/fuses');
  await flipFuses(join(appOutDir, `${packager.appInfo.productFilename}.app`), {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: true,
    [F.RunAsNode]: false,
    [F.EnableNodeOptionsEnvironmentVariable]: false,
    [F.EnableNodeCliInspectArguments]: false,
    [F.EnableCookieEncryption]: true,
    [F.OnlyLoadAppFromAsar]: true,
    [F.EnableEmbeddedAsarIntegrityValidation]: true,
    [F.GrantFileProtocolExtraPrivileges]: false,
  });
};
