function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  const valid = [process.env.ACCESS_TOKEN_SECRET, process.env.ADMIN_TOKEN].filter(Boolean);

  console.log(`[Auth] ${req.method} ${req.path} | token收到: ${token ? token.slice(0,6)+'…' : '无'} | 有效token数: ${valid.length}`);

  if (!token || !valid.includes(token)) {
    console.log(`[Auth] 拒绝 — token不匹配或未设置环境变量`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  req.isAdmin = token === process.env.ADMIN_TOKEN;
  next();
}

module.exports = requireAuth;
