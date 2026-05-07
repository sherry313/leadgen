require('dotenv').config();
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const LEADS_HEADERS  = ['#', 'Company', 'Website', 'Phone', 'Email', 'City', 'Rating', 'Score', 'Status', 'Date'];
const EMAILS_HEADERS = ['Company', 'Email', 'Subject 1', 'Body 1', 'Subject 2', 'Body 2', 'Subject 3', 'Body 3', 'Subject 4', 'Body 4', 'Subject 5', 'Body 5'];
const EMAIL_BODY_COLS = [3, 5, 7, 9, 11];

// ── Auth client (reused across calls) ────────────────────────────────────────
let _auth = null;

function getAuth() {
  if (_auth) return _auth;
  _auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return _auth;
}

// ── Per-run state — reset by createRunSheet() on every pipeline run ──────────
let _spreadsheetId  = null;
let _spreadsheetUrl = null;
let _sheetIds       = null; // { leadsId, emailsId }
let _leadsTab       = null; // tab title used in range strings
let _emailsTab      = null;
let _leadsQueue     = [];
let _emailsQueue    = [];

// ── Retry helper — handles "Quota exceeded" (HTTP 429) gracefully ─────────────
async function withRetry(label, fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isQuota = err.status === 429 || err.code === 429
        || err.message?.toLowerCase().includes('quota');
      if (isQuota && i < attempts - 1) {
        console.warn(`[GoogleSheets] ${label}: quota hit, retrying in 2s (${i + 1}/${attempts - 1})…`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

// ── Add a new tab pair to the fixed spreadsheet for this pipeline run ─────────
// Returns the spreadsheet URL (with gid of the Leads tab), or null on failure.
async function createRunSheet(searchQuery, date) {
  const privateKey    = process.env.GOOGLE_PRIVATE_KEY;
  const serviceEmail  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!privateKey || privateKey.trim() === '') {
    console.warn('[GoogleSheets] GOOGLE_PRIVATE_KEY not set — Google Sheets disabled.');
    return null;
  }
  if (!serviceEmail || serviceEmail.trim() === '') {
    console.warn('[GoogleSheets] GOOGLE_SERVICE_ACCOUNT_EMAIL not set — Google Sheets disabled.');
    return null;
  }
  if (!spreadsheetId || spreadsheetId.trim() === '') {
    console.warn('[GoogleSheets] SPREADSHEET_ID not set — Google Sheets disabled.');
    return null;
  }

  // Reset per-run state
  _auth          = null;
  _spreadsheetId = spreadsheetId;
  _sheetIds      = null;
  _leadsQueue    = [];
  _emailsQueue   = [];

  // Tab names — keep under Google Sheets' 100-char title limit
  const shortQuery = searchQuery.slice(0, 45);
  _leadsTab  = `${shortQuery} - ${date}`;
  _emailsTab = `${shortQuery} - ${date} (Emails)`;

  console.log(`[GoogleSheets] Creating tabs: "${_leadsTab}" | "${_emailsTab}"`);

  try {
    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Step 1: Add both tabs in one batchUpdate
    const addRes = await withRetry('addSheets', () => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: _leadsTab } } },
          { addSheet: { properties: { title: _emailsTab } } },
        ],
      },
    }));

    const replies = addRes.data.replies;
    _sheetIds = {
      leadsId:  replies[0].addSheet.properties.sheetId,
      emailsId: replies[1].addSheet.properties.sheetId,
    };

    _spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${_sheetIds.leadsId}`;
    console.log(`[GoogleSheets] Tabs created → ${_spreadsheetUrl}`);

    // Step 2: Write headers to both tabs in one call
    await withRetry('headers', () => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `'${_leadsTab}'!A1`,  values: [LEADS_HEADERS] },
          { range: `'${_emailsTab}'!A1`, values: [EMAILS_HEADERS] },
        ],
      },
    }));

    // Step 3: Format both tabs in one batchUpdate
    const formatRequests = (sheetId, numCols, bodyColIndices) => [
      { updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
      }},
      { repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
      }},
      { updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1000 },
          properties: { pixelSize: 21 },
          fields: 'pixelSize',
      }},
      { repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: numCols },
          cell: { userEnteredFormat: { wrapStrategy: 'CLIP' } },
          fields: 'userEnteredFormat.wrapStrategy',
      }},
      ...bodyColIndices.map(col => ({ repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: col, endColumnIndex: col + 1 },
          cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
          fields: 'userEnteredFormat.wrapStrategy',
      }})),
    ];

    await withRetry('format', () => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          ...formatRequests(_sheetIds.leadsId,  LEADS_HEADERS.length,  []),
          ...formatRequests(_sheetIds.emailsId, EMAILS_HEADERS.length, EMAIL_BODY_COLS),
        ],
      },
    }));

    console.log(`[GoogleSheets] Tabs formatted and ready`);
    return _spreadsheetUrl;
  } catch (err) {
    console.error('[GoogleSheets] createRunSheet FAILED');
    console.error('[GoogleSheets] message:', err.message);
    console.error('[GoogleSheets] response data:', err.response?.data);
    console.error('[GoogleSheets] FULL ERROR:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    return null;
  }
}

// ── Queue a lead for batch writing — zero API calls ──────────────────────────
function queueLead(lead) {
  if (!_spreadsheetId) return;

  _leadsQueue.push([
    '=ROW()-1',
    lead.companyName  || '',
    lead.website      || '',
    lead.phone        || '',
    lead.email        || '',
    lead.city         || '',
    lead.googleRating || '',
    lead.intentScore  || '',
    lead.status       || '',
    lead.dateAdded    || new Date().toISOString().split('T')[0],
  ]);

  _emailsQueue.push([
    lead.companyName     || '',
    lead.email           || '',
    lead.EMAIL_1_SUBJECT || '',
    lead.EMAIL_1_BODY    || '',
    lead.EMAIL_2_SUBJECT || '',
    lead.EMAIL_2_BODY    || '',
    lead.EMAIL_3_SUBJECT || '',
    lead.EMAIL_3_BODY    || '',
    lead.EMAIL_4_SUBJECT || '',
    lead.EMAIL_4_BODY    || '',
    lead.EMAIL_5_SUBJECT || '',
    lead.EMAIL_5_BODY    || '',
  ]);

  console.log(`[GoogleSheets] Queued: ${lead.companyName}`);
}

// ── Flush all queued leads in one batch write, then auto-resize ───────────────
async function finalizeSheets() {
  if (!_spreadsheetId) return null;
  if (_leadsQueue.length === 0 && _emailsQueue.length === 0) return _spreadsheetUrl;

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  try {
    await withRetry('write', () => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: _spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED', // allows =ROW()-1 formula
        data: [
          { range: `'${_leadsTab}'!A2`,  values: _leadsQueue },
          { range: `'${_emailsTab}'!A2`, values: _emailsQueue },
        ],
      },
    }));

    console.log(`[GoogleSheets] Wrote ${_leadsQueue.length} leads to tabs`);

    await withRetry('resize', () => sheets.spreadsheets.batchUpdate({
      spreadsheetId: _spreadsheetId,
      requestBody: {
        requests: [
          { autoResizeDimensions: { dimensions: { sheetId: _sheetIds.leadsId,  dimension: 'COLUMNS', startIndex: 0, endIndex: LEADS_HEADERS.length  } } },
          { autoResizeDimensions: { dimensions: { sheetId: _sheetIds.emailsId, dimension: 'COLUMNS', startIndex: 0, endIndex: EMAILS_HEADERS.length } } },
        ],
      },
    }));

    console.log('[GoogleSheets] Columns auto-resized');
  } catch (err) {
    console.warn(`[GoogleSheets] finalizeSheets error: ${err.message}`);
  }

  return _spreadsheetUrl;
}

module.exports = { createRunSheet, queueLead, finalizeSheets };
