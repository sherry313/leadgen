// Blotato social-posting API (https://backend.blotato.com/v2).
// Used by the /autopost admin page: list connected social accounts + publish
// (optionally scheduled) posts. API key lives in .env (BLOTATO_API_KEY).
require('dotenv').config();
const axios = require('axios');

const BASE = 'https://backend.blotato.com/v2';

function headers() {
  return {
    'blotato-api-key': process.env.BLOTATO_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

// → [{ id, platform, username, fullname }]
async function listBlotatoAccounts() {
  const res = await axios.get(`${BASE}/users/me/accounts`, { headers: headers(), timeout: 30000 });
  return res.data?.items || [];
}

// Publish (or schedule) one post to one connected account.
// platform: twitter | linkedin | facebook | instagram | youtube | tiktok …
// Platform quirks handled here so the route stays generic:
//  - facebook needs target.pageId
//  - youtube needs a video in mediaUrls + target.title/privacyStatus
//  - instagram needs at least one media url
async function publishBlotatoPost({ accountId, platform, text, mediaUrls = [], scheduledTime = null, pageId = '', title = '' }) {
  const target = { targetType: platform };
  if (platform === 'facebook' && pageId) target.pageId = pageId;
  if (platform === 'youtube') {
    target.title = (title || text || '').slice(0, 95) || 'New post';
    target.privacyStatus = 'public';
    target.shouldNotifySubscribers = false;
  }

  const body = {
    post: {
      accountId: String(accountId),
      target,
      content: { text: text || '', platform, mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [] },
    },
  };
  if (scheduledTime) body.scheduledTime = scheduledTime;

  try {
    const res = await axios.post(`${BASE}/posts`, body, { headers: headers(), timeout: 45000 });
    return { success: true, data: res.data };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`[Blotato] publish failed (${platform}/${accountId}): ${detail}`);
    return { success: false, error: detail };
  }
}

module.exports = { listBlotatoAccounts, publishBlotatoPost };
