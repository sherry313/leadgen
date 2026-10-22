const test = require('node:test');
const assert = require('node:assert/strict');

const { createApifyRunner } = require('../services/apifyRunner');

function response(data, status = 200) {
  return { data, status };
}

test('retries a transient network failure and completes the actor run', async () => {
  let startAttempts = 0;
  const http = {
    async post() {
      startAttempts += 1;
      if (startAttempts === 1) {
        const error = new Error('network error');
        error.code = 'ECONNRESET';
        throw error;
      }
      return response({ data: { id: 'run-123' } });
    },
    async get(url) {
      if (url.includes('/actor-runs/run-123/dataset/items')) {
        return response([{ title: 'Recovered lead' }]);
      }
      return response({ data: { status: 'SUCCEEDED' } });
    },
  };

  const runActor = createApifyRunner({
    http,
    token: 'secret-token',
    sleep: async () => {},
    retryDelayMs: 0,
    pollDelayMs: 0,
    logger: { info() {}, warn() {}, error() {} },
  });

  const items = await runActor('example~actor', { query: 'builders' });

  assert.equal(startAttempts, 2);
  assert.deepEqual(items, [{ title: 'Recovered lead' }]);
});

test('does not retry an authentication failure and reports the failing stage safely', async () => {
  let attempts = 0;
  const http = {
    async post() {
      attempts += 1;
      const error = new Error('Request failed with status code 401');
      error.response = { status: 401, data: { error: { message: 'Invalid token secret-token' } } };
      throw error;
    },
    async get() { throw new Error('must not poll'); },
  };

  const runActor = createApifyRunner({
    http,
    token: 'secret-token',
    sleep: async () => {},
    retryDelayMs: 0,
    pollDelayMs: 0,
    logger: { info() {}, warn() {}, error() {} },
  });

  await assert.rejects(
    () => runActor('example~actor', {}),
    error => {
      assert.equal(error.stage, 'start');
      assert.equal(error.status, 401);
      assert.match(error.message, /Apify start failed/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    },
  );
  assert.equal(attempts, 1);
});
