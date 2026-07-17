/**
 * In-memory plan-aware rate limiting middleware for AI API endpoints.
 * Resets limits daily.
 */

const userRequests = {}; // Memory store: { [uid]: { count: number, dateStr: string } }

const PLAN_DAILY_LIMITS = {
  standard: 0,   // Standard users have no AI access
  pro: 50,       // Pro: 50 requests/day
  max: 150       // Max: 150 requests/day
};

const aiRateLimit = (req, res, next) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'User context not found' });
  }

  const { uid, plan } = user;
  const today = new Date().toISOString().split('T')[0];
  const limit = PLAN_DAILY_LIMITS[plan] !== undefined ? PLAN_DAILY_LIMITS[plan] : 0;

  // 1. Check if user is standard (no access)
  if (limit === 0) {
    return res.status(403).json({ 
      success: false, 
      error: 'AI Copilot is a premium feature. Please upgrade your plan to access it.' 
    });
  }

  // 2. Initialize or reset daily counters
  if (!userRequests[uid] || userRequests[uid].dateStr !== today) {
    userRequests[uid] = {
      count: 0,
      dateStr: today
    };
  }

  // 3. Check limit bounds
  if (userRequests[uid].count >= limit) {
    return res.status(429).json({
      success: false,
      error: `Daily AI usage limit reached (${limit} requests). Resets at midnight UTC.`,
      limit,
      used: userRequests[uid].count
    });
  }

  // Increment usage count
  userRequests[uid].count++;

  // Set usage headers in response for frontend tracking
  res.setHeader('X-AI-Limit-Limit', limit);
  res.setHeader('X-AI-Limit-Remaining', limit - userRequests[uid].count);

  // Attach metadata to request
  req.aiUsage = {
    used: userRequests[uid].count,
    limit,
    remaining: limit - userRequests[uid].count
  };

  next();
};

module.exports = aiRateLimit;
