window.PODCAST_CONFIG = {
  // GitHub Pages is static and cannot proxy RSS itself. These CORS-enabled
  // services are tried in order only when the publisher blocks direct access.
  // For a production/public app, replace these with a proxy you control.
  feedProxies: [
    { url: "https://api.allorigins.win/raw?url=", encode: true },
    { url: "https://corsproxy.io/?url=", encode: true },
    { url: "https://cors.isomorphic-git.org/", encode: false }
  ]
};
