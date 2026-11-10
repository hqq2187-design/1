const { redis, json } = require('../_push');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return json(res, 401, { error: 'Unauthorized' });
  }
  try {
    const db = redis();
    let cursor = '0';
    let subscriptions = 0;
    do {
      const page = await db.scan(cursor, { match: 'sb:push:*', count: 100 });
      cursor = String(page[0]);
      subscriptions += (page[1] || []).filter(key => key.startsWith('sb:push:') && !key.startsWith('sb:push:run:') && !key.startsWith('sb:push:lock:') && !key.startsWith('sb:push:last-role:') && !key.startsWith('sb:push:sent:')).length;
    } while (cursor !== '0');
    return json(res, 200, {
      ok: true,
      configured: {
        vapidPublicKey: Boolean(process.env.VAPID_PUBLIC_KEY),
        vapidPrivateKey: Boolean(process.env.VAPID_PRIVATE_KEY),
        redisUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
        redisToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
        cronSecret: Boolean(process.env.CRON_SECRET)
      },
      subscriptions,
      timeZone: process.env.PUSH_TIME_ZONE || 'Asia/Tokyo',
      runProbability: Number(process.env.PUSH_RUN_PROBABILITY ?? 100)
    });
  } catch (error) {
    console.error('push status failed', error);
    return json(res, 500, { ok: false, error: error.message || 'Status check failed' });
  }
};
