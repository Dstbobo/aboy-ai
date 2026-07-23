const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The Gemini Live Node proxy lives under services/gemini-live-server and is a
// separate backend deploy — keep Metro from scanning/bundling it.
// (Metro's blockList accepts a RegExp array directly in SDK 54+.)
config.resolver.blockList = [
  /services[/\\]gemini-live-server[/\\].*/,
];

module.exports = config;
