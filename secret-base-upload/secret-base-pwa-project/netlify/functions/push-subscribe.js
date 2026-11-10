const adapt = require('../lib/adapter');
const handler = require('../../api/push/subscribe');
exports.handler = adapt(handler);
