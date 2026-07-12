const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
);

// Comma-separated owner/admin emails from .env. req.isAdmin was read all over
// server.js (/api/me, /api/admin/costs, sheetUrl gating) but never assigned —
// admin features were dead for everyone until this.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    console.log(`[Auth] REJECT ${req.method} ${req.path} | no token`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    // First try Supabase JWT
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      console.log(`[Auth] OK ${req.method} ${req.path} | user=${data.user.email}`);
      req.user = data.user;
      req.userId = data.user.id;
      req.isAdmin = ADMIN_EMAILS.includes((data.user.email || '').toLowerCase());
      return next();
    }

    // Fallback: legacy token check (transition period — lets pre-migration
    // ACCESS_TOKEN_SECRET / ADMIN_TOKEN holders keep working until they
    // re-login with email+password).
    const valid = [process.env.ACCESS_TOKEN_SECRET,
                   process.env.ADMIN_TOKEN].filter(Boolean);
    if (valid.includes(token)) {
      // LEGACY-TOKEN backdoor still in use — grep docker logs for this line.
      // If it never appears over your observation window, it's safe to delete
      // this whole fallback block (and the two vars from the VPS .env).
      console.warn(`[Auth] LEGACY-TOKEN used ${req.method} ${req.path} | ip=${req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?'}`);
      req.user = { id: 'legacy', email: 'legacy' };
      req.userId = 'legacy';
      req.isAdmin = true; // legacy token is the owner's
      return next();
    }

    console.log(`[Auth] REJECT ${req.method} ${req.path} | invalid token | len=${token.length} | err=${error?.message}`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  } catch (err) {
    console.log(`[Auth] REJECT ${req.method} ${req.path} | exception: ${err.message}`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}

module.exports = requireAuth;
