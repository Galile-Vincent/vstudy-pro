/** Define the supported distribution targets and reject incomplete signing credentials at the boundary. */
import { join } from 'node:path';

export const targets = [
  { key: 'mac-arm64', platform: 'mac', arch: 'arm64', runner: 'macos-latest', installer: 'dmg', app: 'mac-arm64/VStudy Pro.app' },
  { key: 'mac-x64', platform: 'mac', arch: 'x64', runner: 'macos-15-intel', installer: 'dmg', app: 'mac/VStudy Pro.app' },
  { key: 'win-x64', platform: 'win', arch: 'x64', runner: 'windows-latest', installer: 'exe', app: 'win-unpacked/VStudy Pro.exe' },
  { key: 'win-arm64', platform: 'win', arch: 'arm64', runner: 'windows-11-arm', installer: 'exe', app: 'win-arm64-unpacked/VStudy Pro.exe' },
];

export function targetFor(key) {
  const target = targets.find(item => item.key === key);
  if (!target) throw new Error(`Unknown distribution target ${key}`);
  return target;
}

export function releaseVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Release version must be a stable x.y.z version');
  return version;
}

export function releaseIntent({ event, ref, dryRun = true, version }) {
  releaseVersion(version);
  const tag = ref.startsWith('refs/tags/');
  const publish = (event === 'push' && tag) || (event === 'workflow_dispatch' && dryRun === false);
  if (tag || publish) {
    if (ref !== `refs/tags/v${version}`) throw new Error('Release ref must equal v plus the desktop version');
  }
  return { publish, version, tag: `v${version}` };
}

const credentialGroups = {
  certificate: ['CSC_LINK', 'CSC_KEY_PASSWORD'],
  appleApi: ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'],
  appleAccount: ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
  azure: ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_ENDPOINT', 'AZURE_CODE_SIGNING_ACCOUNT', 'AZURE_CERTIFICATE_PROFILE'],
  pfx: ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD'],
  hook: ['WIN_SIGNTOOL_HOOK'],
};

function credentialGroup(env, name) {
  const keys = credentialGroups[name];
  const present = keys.filter(key => Boolean(env[key]));
  if (present.length && present.length !== keys.length) {
    throw new Error(`Incomplete ${name} credentials; missing ${keys.filter(key => !env[key]).join(', ')}`);
  }
  return present.length > 0;
}

export function signingMode(platform, env) {
  if (platform === 'mac') {
    const certificate = credentialGroup(env, 'certificate') || Boolean(env.CSC_NAME);
    const api = credentialGroup(env, 'appleApi');
    const account = credentialGroup(env, 'appleAccount');
    if (certificate && (api || account)) return api ? 'apple-api' : 'apple-account';
    if (certificate || api || account) throw new Error('Mac signing requires a certificate and complete notarization credentials');
    return 'unsigned';
  }
  if (platform !== 'win') throw new Error(`Unsupported signing platform ${platform}`);
  const modes = ['azure', 'pfx', 'hook'].filter(name => credentialGroup(env, name));
  if (modes.length > 1) throw new Error('Configure exactly one Windows signing backend');
  if (modes[0] === 'azure' && !env.WIN_PUBLISHER_NAME) throw new Error('Incomplete azure credentials; missing WIN_PUBLISHER_NAME');
  if (env.WIN_SIGNTOOL_CREDENTIALS) {
    if (modes[0] !== 'hook') throw new Error('WIN_SIGNTOOL_CREDENTIALS requires WIN_SIGNTOOL_HOOK');
    try {
      const credentials = JSON.parse(env.WIN_SIGNTOOL_CREDENTIALS);
      if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) throw new Error();
    } catch { throw new Error('WIN_SIGNTOOL_CREDENTIALS must contain a JSON object'); }
  }
  return modes[0] ?? 'unsigned';
}

export function signingConfiguration(platform, mode, env) {
  if (platform === 'mac') return {
    forceCodeSigning: mode !== 'unsigned',
    mac: { notarize: mode !== 'unsigned', ...(mode === 'unsigned' ? { identity: null } : {}) },
  };
  const publisher = env.WIN_PUBLISHER_NAME ? { publisherName: env.WIN_PUBLISHER_NAME } : {};
  if (mode === 'azure') return { forceCodeSigning: true, win: { azureSignOptions: {
    endpoint: env.AZURE_ENDPOINT, codeSigningAccountName: env.AZURE_CODE_SIGNING_ACCOUNT,
    certificateProfileName: env.AZURE_CERTIFICATE_PROFILE, ...publisher,
  } } };
  if (mode === 'hook') return { forceCodeSigning: true, win: { signtoolOptions: { sign: env.WIN_SIGNTOOL_HOOK, ...publisher } } };
  return { forceCodeSigning: mode === 'pfx', win: { ...(mode === 'pfx' ? { signtoolOptions: publisher } : {}) } };
}

export function unsignedEnvironment(env) {
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/^(?:CSC_|WIN_CSC_|WIN_SIGNTOOL_|APPLE_|AZURE_)/.test(key) && key !== 'WIN_PUBLISHER_NAME'));
  return { ...clean, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
}

export function assetNames(target, version) {
  releaseVersion(version);
  const stem = `VStudy-Pro-${version}-${target.key}`;
  return { installer: `${stem}.${target.installer}`, archive: `${stem}.zip`, stable: `VStudy-Pro-${target.key}.${target.installer}` };
}

export function packagedExecutable(target, output) {
  const app = join(output, target.app);
  return target.platform === 'mac' ? join(app, 'Contents', 'MacOS', 'VStudy Pro') : app;
}
