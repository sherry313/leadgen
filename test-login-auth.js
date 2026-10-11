const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/login.html', 'utf8');

assert.match(html, /function _loginError\(/, 'login must distinguish auth failures');
assert.match(html, /Email not confirmed/i, 'unconfirmed email must get a specific message');
assert.match(html, /auth\.resend\(/, 'unconfirmed users must be able to resend confirmation');
assert.match(html, /id="resendConfirmBtn"/, 'login page must expose the recovery action');
assert.doesNotMatch(
  html,
  /_showError\('邮箱或密码错误（或邮箱还没确认）'\)/,
  'the ambiguous error that caused this bug must not return',
);

console.log('login auth recovery checks passed');
