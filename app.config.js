// Web exports served from a subpath (GitHub Pages: /<repo>/) need a base URL so the
// bundle and assets resolve. The deploy workflow sets EXPO_BASE_URL to the repo name.
const base = (process.env.EXPO_BASE_URL || '').replace(/\/+$/, '');

module.exports = ({ config }) => ({
  ...config,
  experiments: { ...(config.experiments || {}), baseUrl: base },
});
