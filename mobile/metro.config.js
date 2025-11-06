const {getSentryExpoConfig} = require("@sentry/react-native/metro")
const path = require("path")

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname)

config.transformer.getTransformOptions = async () => ({
  transform: {
    // Inline requires are very useful for deferring loading of large dependencies/components.
    // For example, we use it in app.tsx to conditionally load Reactotron.
    // However, this comes with some gotchas.
    // Read more here: https://reactnative.dev/docs/optimizing-javascript-loading
    // And here: https://github.com/expo/expo/issues/27279#issuecomment-1971610698
    inlineRequires: true,
  },
})

// This helps support certain popular third-party libraries
// such as Firebase that use the extension cjs.
config.resolver.sourceExts.push("cjs")

// Watch the core and cloud modules for changes
config.watchFolders = [
  path.resolve(__dirname, "./modules/core"),
  path.resolve(__dirname, "../cloud/packages/types/src"),
]

// Resolve the core module from the parent directory
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules"), path.resolve(__dirname, "..")]

// Performance optimizations
config.serializer = {
  ...config.serializer,
  // Enable source map support in development but disable in production for smaller bundles
  customSerializer: config.serializer?.customSerializer,
}

// Optimize transformer cache
config.transformer = {
  ...config.transformer,
  // Enable Hermes bytecode compilation
  unstable_allowRequireContext: false,
  // Optimize asset transforms
  assetPlugins: config.transformer?.assetPlugins || [],
}

module.exports = config
