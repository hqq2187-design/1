const adapt = require('../lib/adapter');
const handler = require('../../api/push/status');
exports.handler = adapt(handler);
