module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === '@assistant-ui/generative-ui' && pkg.version === '0.0.8') {
        // Keep the vocabulary's Zod 4 runtime isolated from the app's Zod 3 IPC schemas.
        const peers = { ...pkg.peerDependencies };
        delete peers.zod;
        pkg.peerDependencies = peers;
        pkg.dependencies = { ...pkg.dependencies, zod: '4.6.7' };
      }
      return pkg;
    },
  },
};
