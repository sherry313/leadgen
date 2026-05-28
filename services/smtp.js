const nodemailer = require('nodemailer');

function buildTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
}

async function testConnection(cfg) {
  const transporter = buildTransport(cfg);
  await transporter.verify();
  return true;
}

async function sendBatch(cfg, leads, onProgress, abortRef) {
  const transporter = buildTransport(cfg);
  const from = cfg.fromName ? `"${cfg.fromName}" <${cfg.user}>` : cfg.user;
  const signature = cfg.signature || cfg.user;
  const delayMinMs = (cfg.delayMin || 60) * 1000;
  const delayMaxMs = (cfg.delayMax || 180) * 1000;
  const total = leads.length;
  const results = [];

  for (let i = 0; i < leads.length; i++) {
    if (abortRef && abortRef.aborted) break;

    const lead = leads[i];
    const firstName = (lead.ownerName || lead.companyName || '').split(' ')[0] || 'there';
    const replacePlaceholders = (str) => (str || '')
      .replace(/\{first_name\}/gi, firstName)
      .replace(/\{company\}/gi, lead.companyName || '')
      .replace(/\{website\}/gi, lead.website || '')
      .replace(/\{\{accountSignature\}\}/g, cfg.signature || cfg.user || '');

    const subject = replacePlaceholders(lead.EMAIL_1_SUBJECT || lead.email1_subject || '');
    const body    = replacePlaceholders(lead.EMAIL_1_BODY    || lead.email1_body    || '');

    let status = 'sent';
    let error;
    try {
      await transporter.sendMail({
        from,
        to: lead.email,
        subject,
        text: body,
      });
    } catch (err) {
      status = 'failed';
      error = err.message;
    }

    const result = { email: lead.email, companyName: lead.companyName, status };
    if (error) result.error = error;
    results.push(result);

    if (typeof onProgress === 'function') {
      try { onProgress(i + 1, total, lead.companyName, status, 0); } catch (_) {}
    }

    if (i < leads.length - 1) {
      if (abortRef && abortRef.aborted) break;
      const waitMs = Math.floor(delayMinMs + Math.random() * (delayMaxMs - delayMinMs));
      const waitSec = Math.round(waitMs / 1000);
      if (typeof onProgress === 'function') {
        try { onProgress(i + 1, total, lead.companyName, 'waiting', waitSec); } catch (_) {}
      }
      const startedAt = Date.now();
      while (Date.now() - startedAt < waitMs) {
        if (abortRef && abortRef.aborted) break;
        await new Promise(r => setTimeout(r, Math.min(500, waitMs - (Date.now() - startedAt))));
      }
    }
  }

  return results;
}

module.exports = { testConnection, sendBatch };
