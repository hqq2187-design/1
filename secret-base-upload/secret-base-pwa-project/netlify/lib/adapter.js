// Adapt the existing Vercel-style handlers to Netlify Functions without changing business logic.
module.exports = function adaptVercelHandler(handler, options = {}) {
  return async function netlifyHandler(event) {
    const headers = {};
    for (const [key, value] of Object.entries(event.headers || {})) {
      headers[String(key).toLowerCase()] = value;
    }

    // Scheduled Functions do not receive an HTTP Authorization header.
    // Inject the server-side secret only for the trusted scheduled invocation.
    if (options.scheduled) {
      headers.authorization = `Bearer ${process.env.CRON_SECRET || ''}`;
    }

    let body;
    if (event.body) {
      try {
        body = event.isBase64Encoded
          ? JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'))
          : JSON.parse(event.body);
      } catch {
        body = undefined;
      }
    }

    const req = {
      method: event.httpMethod || 'POST',
      headers,
      body,
    };

    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
        return this;
      },
      send(value) {
        this.body = typeof value === 'string' ? value : JSON.stringify(value);
        return this;
      },
    };

    await handler(req, res);
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: res.body || '',
    };
  };
};
