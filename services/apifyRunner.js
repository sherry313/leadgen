const DEFAULT_BASE_URL = 'https://api.apify.com/v2';
const TRANSIENT_CODES = new Set([
  'ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETDOWN',
  'ENETUNREACH', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT',
]);

function redact(value, token) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return token ? text.split(token).join('<REDACTED>') : text;
}

function errorDetails(error, token) {
  return {
    message: redact(error?.message || 'Unknown error', token),
    code: error?.code || null,
    status: error?.response?.status || null,
    response: redact(error?.response?.data ?? '', token).slice(0, 1200),
  };
}

function isTransient(error) {
  const status = error?.response?.status;
  return TRANSIENT_CODES.has(error?.code) || status === 408 || status === 429 || status >= 500;
}

function createApifyRunner({
  http,
  token,
  baseUrl = DEFAULT_BASE_URL,
  logger = console,
  maxAttempts = 3,
  retryDelayMs = 1000,
  pollDelayMs = 4000,
  runTimeoutMs = 10 * 60 * 1000,
  requestTimeoutMs = 30000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  if (!http) throw new Error('Apify runner requires an HTTP client');

  async function request(stage, operation) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const details = errorDetails(error, token);
        const retry = isTransient(error) && attempt < maxAttempts;
        const log = retry ? logger.warn : logger.error;
        log.call(logger, `[ApifyRunner] ${stage} failed`, { ...details, attempt, maxAttempts, retry });
        if (retry) {
          await sleep(retryDelayMs * attempt);
          continue;
        }

        const wrapped = new Error(`Apify ${stage} failed: ${details.message}`);
        wrapped.stage = stage;
        wrapped.status = details.status;
        wrapped.code = details.code;
        wrapped.cause = error;
        throw wrapped;
      }
    }
  }

  return async function runApifyActor(actorId, input) {
    const config = {
      params: { token },
      headers: { 'Content-Type': 'application/json' },
      timeout: requestTimeoutMs,
    };
    const start = await request('start', () =>
      http.post(`${baseUrl}/acts/${actorId}/runs`, input, config));
    const runId = start?.data?.data?.id;
    if (!runId) throw new Error('Apify start failed: response did not include a run ID');

    let status = 'RUNNING';
    const deadline = Date.now() + runTimeoutMs;
    while (status === 'RUNNING' || status === 'READY') {
      if (Date.now() > deadline) throw new Error(`Apify poll failed: run ${runId} timed out`);
      await sleep(pollDelayMs);
      const result = await request('poll', () =>
        http.get(`${baseUrl}/actor-runs/${runId}`, { params: { token }, timeout: requestTimeoutMs }));
      status = result?.data?.data?.status;
    }

    if (status !== 'SUCCEEDED') throw new Error(`Apify poll failed: run ${runId} ended with ${status || 'unknown status'}`);
    const items = await request('dataset', () =>
      http.get(`${baseUrl}/actor-runs/${runId}/dataset/items`, {
        params: { token, format: 'json' },
        timeout: requestTimeoutMs,
      }));
    return items.data || [];
  };
}

module.exports = { createApifyRunner, errorDetails, isTransient };
