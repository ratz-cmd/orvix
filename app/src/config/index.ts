export const CONFIG = {
  SITE_URL: 'https://orvix.tax',
  DNS_PRIMARY: '1.1.1.1',
  DNS_SECONDARY: '1.0.0.1',
  DNS_DOH_URL: 'https://cloudflare-dns.com/dns-query',
  APP_NAME: 'Orvix',
  USER_AGENT:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  USER_AGENT_IOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

export const UPDATE_CHECK = {
  RENTRY_URL: 'https://rentry.co/orvix',
  MANIFEST_PATH: '/app/version.json',
  GITHUB_VERSION_RAW_PATH: '/raw/refs/heads/main/app/version.json',
  TIMEOUT_MS: 5000,
  PENDING_DOWNLOAD_KEY: 'update:pendingDownload',
};

export const FALLBACK_CONFIG = {
  PRIMARY_URL: 'https://orvix.tax',
  // Repli utilisé seulement si rentry.co puis <miroir>/address.json sont
  // injoignables. Il doit désigner un dépôt qui existe réellement et qui
  // contient app/version.json : l'ancien dépôt (ratz-cmd) répond 404, donc
  // la vérification de mise à jour échouait dans exactement le cas où elle sert
  // — quand le réseau est filtré.
  GITHUB_URL: 'https://github.com/ratz-cmd/orvix',
  TELEGRAM_URL: 'https://t.me/orvix_site',
};
