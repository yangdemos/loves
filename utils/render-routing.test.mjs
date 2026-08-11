import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '..');

function request(port, targetPath, options = {}) {
  const { method = 'GET', headers = {} } = options;

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: targetPath,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function waitForServer(port) {
  let lastError = null;

  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await request(port, '/api/health');
      if (response.statusCode === 200) {
        return;
      }
      lastError = new Error(`Unexpected health status: ${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  throw lastError || new Error(`Server on port ${port} did not become ready.`);
}

async function startServer(envOverrides) {
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: projectRoot,
    env: { ...process.env, ...envOverrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(envOverrides.PORT);
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`${error.message}\n${output}`);
  }

  async function stop() {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), delay(2000)]);
  }

  return { stop };
}

test('default root keeps index page when LANDING_PAGE is not set', async () => {
  const server = await startServer({
    PORT: '3101',
    HTTPS_PORT: '8541',
    ENABLE_LOCAL_HTTPS: 'false',
    LANDING_PAGE: '',
  });

  try {
    const response = await request(3101, '/');
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<title>欢迎回家<\/title>/);
  } finally {
    await server.stop();
  }
});

test('Render-style root redirects to home and video keeps ranged responses', async () => {
  const server = await startServer({
    PORT: '3102',
    HTTPS_PORT: '8542',
    ENABLE_LOCAL_HTTPS: 'false',
    LANDING_PAGE: '/home.html',
  });

  try {
    const rootResponse = await request(3102, '/');
    assert.equal(rootResponse.statusCode, 302);
    assert.equal(rootResponse.headers.location, '/home.html');

    const homeResponse = await request(3102, '/home.html');
    assert.equal(homeResponse.statusCode, 200);
    assert.match(homeResponse.body, /id="bg-video"/);
    assert.match(homeResponse.body, /coverr_video\.mp4/);

    const videoResponse = await request(3102, '/coverr_video.mp4', {
      headers: { Range: 'bytes=0-1023' },
    });
    assert.equal(videoResponse.statusCode, 206);
    assert.equal(videoResponse.headers['accept-ranges'], 'bytes');
    assert.match(videoResponse.headers['content-range'], /^bytes 0-1023\//);
  } finally {
    await server.stop();
  }
});

test('Windows-style rewritten landing page still redirects to a browser path', async () => {
  const server = await startServer({
    PORT: '3104',
    HTTPS_PORT: '8544',
    ENABLE_LOCAL_HTTPS: 'false',
    LANDING_PAGE: 'D:/git/Git/home.html',
  });

  try {
    const response = await request(3104, '/');
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/home.html');
  } finally {
    await server.stop();
  }
});
