module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated 4 (SDK 54) moved its worklets Babel plugin here. Must be last.
      'react-native-worklets/plugin',
    ],
  };
};
