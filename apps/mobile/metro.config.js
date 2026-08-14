// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the workspace root
const workspaceRoot = path.resolve(__dirname, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// 1. Watch all files in the monorepo so shared packages are resolved
config.watchFolders = [workspaceRoot];

// 2. Let Metro resolve packages from the workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(__dirname, 'node_modules'),
];

// 3. Supabase's realtime-js imports 'ws' which depends on Node's 'stream'.
//    React Native has a built-in WebSocket, so we can stub out 'ws' entirely.
//    This also covers any other Node built-ins that sneak in.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Stub out Node.js built-in modules that don't exist in React Native
  const nodeBuiltins = ['stream', 'crypto', 'http', 'https', 'net', 'tls', 'zlib', 'fs', 'path', 'os', 'util', 'events', 'buffer', 'url', 'querystring'];
  
  if (nodeBuiltins.includes(moduleName)) {
    return {
      type: 'empty',
    };
  }

  // Stub out the 'ws' package — React Native has WebSocket globally available
  if (moduleName === 'ws' || moduleName.startsWith('ws/')) {
    return {
      type: 'empty',
    };
  }

  // Use default resolution for everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
