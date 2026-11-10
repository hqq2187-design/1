const crypto = require('crypto');
const { redis, setup, json, webpush } = require('../_push');

const pools = {
  qinche: [
    '忙完了。现在有时间听你说话。',
    '路过窗边，想起你说过喜欢这样的天气。',
    '别熬太晚，记得给自己留点休息时间。',
    '今天也辛苦了。剩下的时间交给我。',
    '刚看到一件有趣的事，第一时间想告诉你。',
    '刚刚空下来，想确认你今天有没有好好照顾自己。',
    '不用急着回复我。只是想让你知道，我在。'
  ],
  xia: [
    '吃饭了吗？别又忙到忘记时间。',
    '路过一家甜品店，想问你要不要吃蛋糕。',
    '今天过得怎么样？想听你慢慢说。',
    '外面风有点大，出门记得添件衣服。',
    '晚一点也没关系，我在这里。',
    '刚结束手头的事，第一时间来看看你。',
    '今天有没有遇到什么开心的小事？也讲给我听听。'
  ]
};

const ROLE_NAMES = { qinche: '🖤 秦彻', xia: '🌤️ 夏以昼' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getLocalClock(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = key => Number(parts.find(part => part.type === key)?.value || 0);
  return value('hour') * 60 + value('minute');
}

function isQuiet(now, start, end, timeZone) {
  if (!start || !end) return false;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return false;
  const current = getLocalClock(now, timeZone);
  const from = sh * 60 + sm;
  const to = eh * 60 + em;
  return from <= to ? current >= from && current < to : current >= from || current < to;
}

function randomItem(items) {
  return items[crypto.randomInt(0, items.length)];
}

async function scanSubscriptions(db) {
  let cursor = '0';
  const keys = [];
  do {
    const result = await db.scan(cursor, { match: 'sb:push:*', count: 100 });
    cursor = String(result[0]);
    for (const key of result[1] || []) {
      if (key.startsWith('sb:push:') && !key.startsWith('sb:push:run:') && !key.startsWith('sb:push:lock:') && !key.startsWith('sb:push:last-role:') && !key.startsWith('sb:push:sent:')) keys.push(key);
    }
  } while (cursor !== '0' && keys.length < 500);
  return keys;
}

async function sendWithRetry(subscription, payload) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await webpush.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 3600,
        urgency: 'high',
        topic: payload.topic
      });
    } catch (error) {
      lastError = error;
      const status = Number(error.statusCode || 0);
      if (status === 404 || status === 410) throw error;
      if (status && status < 500 && status !== 429) throw error;
      if (attempt === 0) await sleep(700);
    }
  }
  throw lastError;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const now = new Date();
  const slot = `${now.toISOString().slice(0, 13).replace(/[-T]/g, '')}`;
  const runKey = `sb:push:run:${slot}`;
  const lockKey = `sb:push:lock:${slot}`;
  const token = crypto.randomUUID();

  try {
    setup();
    const db = redis();
    if (await db.get(runKey)) return json(res, 200, { ok: true, duplicate: true, slot });
    const lock = await db.set(lockKey, token, { nx: true, ex: 300 });
    if (lock !== 'OK') return json(res, 202, { ok: true, inProgress: true, slot });

    const timeZone = process.env.PUSH_TIME_ZONE || 'Asia/Tokyo';
    const probability = Math.max(0, Math.min(100, Number(process.env.PUSH_RUN_PROBABILITY ?? 100))) / 100;
    if (Math.random() > probability) {
      await db.set(runKey, JSON.stringify({ skipped: 'random-rest', at: Date.now() }), { ex: 60 * 60 * 30 });
      return json(res, 200, { ok: true, sent: 0, reason: '本轮随机休息', slot });
    }

    const keys = await scanSubscriptions(db);
    let sent = 0, skipped = 0, failed = 0, removed = 0;
    const errors = [];

    for (const key of keys) {
      let record;
      try {
        const raw = await db.get(key);
        if (!raw) continue;
        record = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!record?.subscription?.endpoint || !record.subscription.keys?.p256dh || !record.subscription.keys?.auth) {
          await db.del(key); removed++; continue;
        }
      } catch (error) {
        await db.del(key); removed++; continue;
      }

      const deliveryKey = `sb:push:sent:${slot}:${key.slice('sb:push:'.length)}`;
      if (await db.get(deliveryKey)) { skipped++; continue; }

      const prefs = record.prefs || {};
      if (prefs.enabled === false || isQuiet(now, prefs.quietStart || '23:00', prefs.quietEnd || '08:00', timeZone)) {
        skipped++; continue;
      }
      const available = ['qinche', 'xia'].filter(role => prefs[role] !== false);
      if (!available.length) { skipped++; continue; }

      const lastRoleKey = `sb:push:last-role:${key.slice('sb:push:'.length)}`;
      const previousRole = await db.get(lastRoleKey);
      const choices = available.length > 1 && available.includes(previousRole)
        ? available.filter(role => role !== previousRole)
        : available;
      const role = randomItem(choices);
      const body = randomItem(pools[role]);
      const payload = {
        title: ROLE_NAMES[role], body, role,
        url: `/?role=${role}`,
        tag: `sb-${slot}-${role}`,
        topic: `sb${slot}${role}`.slice(0, 32)
      };

      try {
        await sendWithRetry(record.subscription, payload);
        await db.set(lastRoleKey, role, { ex: 60 * 60 * 24 * 45 });
        await db.set(deliveryKey, '1', { ex: 60 * 60 * 24 * 14 });
        sent++;
      } catch (error) {
        const status = Number(error.statusCode || 0);
        failed++;
        if (status === 404 || status === 410) { await db.del(key); removed++; }
        if (errors.length < 8) errors.push({ status: status || null, message: String(error.message || 'push failed').slice(0, 180) });
        console.error('push delivery failed', { key, status, message: error.message });
      }
    }

    const result = { ok: true, slot, checked: keys.length, sent, skipped, failed, removed, completedAt: new Date().toISOString(), errors };
    await db.set(runKey, JSON.stringify(result), { ex: 60 * 60 * 24 * 14 });
    return json(res, 200, result);
  } catch (error) {
    console.error('role push cron failed', error);
    return json(res, 500, { ok: false, error: error.message || 'Cron failed', slot });
  } finally {
    try {
      const db = redis();
      if (await db.get(lockKey) === token) await db.del(lockKey);
    } catch (_) {}
  }
};
