const adapt = require('../lib/adapter');
const handler = require('../../api/push/config');
exports.handler = adapt(handler);
