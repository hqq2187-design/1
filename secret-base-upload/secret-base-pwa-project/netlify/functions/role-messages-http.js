const adapt = require('../lib/adapter');
const handler = require('../../api/cron/role-messages');
exports.handler = adapt(handler);
