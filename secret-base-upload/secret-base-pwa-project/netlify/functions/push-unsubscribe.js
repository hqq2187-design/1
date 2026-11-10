const adapt = require('../lib/adapter');
const handler = require('../../api/push/unsubscribe');
exports.handler = adapt(handler);
