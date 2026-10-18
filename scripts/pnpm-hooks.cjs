// These docgen packages require the JavaScript compiler API removed in TS 7.
// Give them a private TS 6 dependency instead of Portal's TS 7 compiler peer.
const docgenPackages = new Set([
  "@storybook/react@10.6.2",
  "@joshwooding/vite-plugin-react-docgen-typescript@0.7.0",
  "react-docgen-typescript@2.4.0",
]);

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (docgenPackages.has(`${pkg.name}@${pkg.version}`)) {
        delete pkg.peerDependencies?.typescript;
        delete pkg.peerDependenciesMeta?.typescript;
        pkg.dependencies = { ...pkg.dependencies, typescript: "6.0.3" };
      }
      return pkg;
    },
  },
};
