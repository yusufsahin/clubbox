self.__BUILD_MANIFEST = (function(a) {
  return {
    __rewrites: { afterFiles: [], beforeFiles: [], fallback: [] },
    '/home': [a, '/_next/static/chunks/fixture-room.js'],
    sortedPages: ['/home'],
  };
})('/_next/static/chunks/webpack.js');
self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB();
