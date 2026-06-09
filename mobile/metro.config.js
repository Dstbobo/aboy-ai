const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);

// The Gemini Live Node proxy lives under services/gemini-live-server and is a
// separate backend deploy — keep Metro from scanning/bundling it.
config.resolver.blockList = exclusionList([
  /services[/\\]gemini-live-server[/\\].*/,
]);

module.exports = config;
