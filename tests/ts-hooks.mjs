// Module resolution hook for the unit tests: app code imports "./i18n/t" without an
// extension (the bundler allows it); Node needs "./i18n/t.ts", so that is tried next.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[cm]?[jt]sx?$|\.json$/.test(specifier);
    if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !relative || hasExtension) throw err;
    return next(specifier + '.ts', context);
  }
}
