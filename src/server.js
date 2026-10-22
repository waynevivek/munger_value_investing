const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { createEditableFinancialFitConfig } = require('./financial-fit.js');
const { datasetSummary, loadPilotDataset } = require('./pilot-data.js');
const {
  RequestError,
  listCompanies,
  parseLookbackYears,
  screenCompany,
} = require('./screen-service.js');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function applyCommonHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
}

function sendJson(response, statusCode, payload) {
  applyCommonHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  if (error instanceof RequestError) {
    sendJson(response, error.statusCode, {
      error: { code: error.code, message: error.message },
    });
    return;
  }
  console.error('Unhandled request error:', error);
  sendJson(response, 500, {
    error: { code: 'internal-error', message: 'The server could not complete this request.' },
  });
}

function queryObject(searchParams) {
  return Object.fromEntries(searchParams.entries());
}

function handleApi(request, response, url, companies, now) {
  const { pathname } = url;

  if (request.method !== 'GET') {
    sendJson(response, 405, {
      error: { code: 'method-not-allowed', message: 'Only GET is supported by this API.' },
    });
    return;
  }

  try {
    if (pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/config') {
      sendJson(response, 200, { configuration: createEditableFinancialFitConfig() });
      return;
    }

    if (pathname === '/api/dataset') {
      const lookbackYears = parseLookbackYears(url.searchParams.get('lookbackYears') ?? undefined);
      const preset = url.searchParams.get('preset') ?? undefined;
      sendJson(response, 200, {
        dataset: datasetSummary(companies),
        lookbackYears,
        companies: listCompanies(companies, { lookbackYears, now, preset }),
      });
      return;
    }

    if (pathname === '/api/companies') {
      const lookbackYears = parseLookbackYears(url.searchParams.get('lookbackYears') ?? undefined);
      const preset = url.searchParams.get('preset') ?? undefined;
      sendJson(response, 200, {
        lookbackYears,
        companies: listCompanies(companies, { lookbackYears, now, preset }),
      });
      return;
    }

    const match = pathname.match(/^\/api\/companies\/([^/]+)$/);
    if (match) {
      const params = queryObject(url.searchParams);
      params.companyId = decodeURIComponent(match[1]);
      sendJson(response, 200, screenCompany(companies, params, { now }));
      return;
    }

    sendJson(response, 404, {
      error: { code: 'not-found', message: `No API route matches ${pathname}.` },
    });
  } catch (error) {
    sendError(response, error);
  }
}

function serveStatic(request, response, url, publicDir) {
  if (request.method !== 'GET') {
    sendJson(response, 405, {
      error: { code: 'method-not-allowed', message: 'Only GET is supported for static files.' },
    });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(response, 400, {
      error: { code: 'invalid-path', message: 'The requested path is not valid.' },
    });
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const root = path.resolve(publicDir);
  const filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    sendJson(response, 404, {
      error: { code: 'not-found', message: 'The requested file was not found.' },
    });
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      const statusCode = error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500;
      sendJson(response, statusCode, {
        error: {
          code: statusCode === 404 ? 'not-found' : 'static-read-failed',
          message: statusCode === 404
            ? 'The requested file was not found.'
            : 'The requested file could not be read.',
        },
      });
      return;
    }
    applyCommonHeaders(response);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(contents);
  });
}

function createServer({
  companies = loadPilotDataset(),
  publicDir = PUBLIC_DIR,
  now = () => new Date(),
} = {}) {
  return http.createServer((request, response) => {
    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    } catch {
      sendJson(response, 400, {
        error: { code: 'invalid-url', message: 'The request URL is not valid.' },
      });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      handleApi(request, response, url, companies, now());
      return;
    }
    serveStatic(request, response, url, publicDir);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`Munger Screener local pilot running at http://${host}:${port}`);
    console.log('Manual-price entry only. No live price or automated NSE collection.');
  });
}

module.exports = { createServer };
