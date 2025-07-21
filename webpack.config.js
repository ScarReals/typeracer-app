const webpack = require('webpack');

module.exports = {
  // ... your existing config

  resolve: {
    fallback: {
      "process": require.resolve("process/browser.js")
    }
  },

  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
  ],
};
