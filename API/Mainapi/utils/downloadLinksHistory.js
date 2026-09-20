const { getPool } = require('../mysqlPool');

function normalizeAuthType(userType) {
  return userType === 'bip39' ? 'bip-39' : 'oauth';
}

async function logDownloadLinkAction({
  adminId,
  userType,
  action,
  mediaType,
  tmdbId,
  season = null,
  episode = null,
  linkUrl,
  linkType = 'download',
}) {
  if (!adminId || !userType || !action || !mediaType || !tmdbId || !linkUrl) {
    throw new Error('logDownloadLinkAction: missing required fields');
  }
  const pool = getPool();
  await pool.execute(
    `INSERT INTO download_links_history
     (admin_id, admin_auth_type, action, media_type, tmdb_id, season, episode, link_url, link_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(adminId),
      normalizeAuthType(userType),
      action,
      mediaType,
      Number(tmdbId),
      season !== null && season !== undefined ? Number(season) : null,
      episode !== null && episode !== undefined ? Number(episode) : null,
      String(linkUrl),
      linkType,
    ]
  );
}

module.exports = { logDownloadLinkAction, normalizeAuthType };
