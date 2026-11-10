const adapt = require('../lib/adapter');
const handler = require('../../api/cron/role-messages');

exports.config = {
  // UTC: 00:00, 05:00, 12:00 (approximately 09:00, 14:00, 21:00 in Japan).
  schedule: '0 0,5,12 * * *',
};

exports.handler = adapt(handler, { scheduled: true });
