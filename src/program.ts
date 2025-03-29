/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { program } from 'commander';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

import { createServer } from './index';
import { ServerList } from './server';

import type { LaunchOptions } from 'playwright';
import assert from 'assert';

const packageJSON = require('../package.json');

program
    .version('Version ' + packageJSON.version)
    .name(packageJSON.name)
    .option('--headless', 'Run browser in headless mode, headed by default')
    .option('--user-data-dir <path>', 'Path to the user data directory')
    .option('--vision', 'Run server that uses screenshots (Aria snapshots are used by default)')
    .option('--port <port>', 'Port to listen on for SSE transport.')
    .option('--ws-endpoint <endpoint>', 'WebSocket endpoint for CDP connection')
    .action(async options => {
      console.log('Starting program...');
      console.log('Options:', options);
      
      // Get CDP endpoint from command line arguments
      const wsEndpoint = options.wsEndpoint;
      console.log('Using wsEndpoint:', wsEndpoint);
      
      const launchOptions: LaunchOptions = {
        headless: !!options.headless,
        channel: 'chrome',
        args: wsEndpoint ? undefined : ['--remote-debugging-port=9222']
      };
      
      console.log('Launch options:', launchOptions);
      
      const userDataDir = options.userDataDir ?? await createUserDataDir();
      console.log('Using userDataDir:', userDataDir);
      
      const serverList = new ServerList(() => createServer({
        userDataDir,
        launchOptions,
        vision: !!options.vision,
        wsEndpoint
      }));
      
      setupExitWatchdog(serverList);

      if (options.port) {
        console.log('Starting SSE server on port:', options.port);
        startSSEServer(+options.port, serverList);
      } else {
        console.log('Starting server with stdio transport...');
        const server = await serverList.create();
        await server.connect(new StdioServerTransport());
      }
    });

program.parse(process.argv);

function setupExitWatchdog(serverList: ServerList) {
  process.stdin.on('close', async () => {
    setTimeout(() => process.exit(0), 15000);
    await serverList.closeAll();
    process.exit(0);
  });
}

async function createUserDataDir() {
  let cacheDirectory: string;
  if (process.platform === 'linux')
    cacheDirectory = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  else if (process.platform === 'darwin')
    cacheDirectory = path.join(os.homedir(), 'Library', 'Caches');
  else if (process.platform === 'win32')
    cacheDirectory = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  else
    throw new Error('Unsupported platform: ' + process.platform);
  const result = path.join(cacheDirectory, 'ms-playwright', 'mcp-chrome-profile');
  await fs.promises.mkdir(result, { recursive: true });
  return result;
}

async function startSSEServer(port: number, serverList: ServerList) {
  const sessions = new Map<string, SSEServerTransport>();
  const httpServer = http.createServer(async (req, res) => {
    if (req.method === 'POST') {
      const searchParams = new URL(`http://localhost${req.url}`).searchParams;
      const sessionId = searchParams.get('sessionId');
      if (!sessionId) {
        res.statusCode = 400;
        res.end('Missing sessionId');
        return;
      }
      const transport = sessions.get(sessionId);
      if (!transport) {
        res.statusCode = 404;
        res.end('Session not found');
        return;
      }
      const server = await serverList.create();
      await server.connect(transport);
      res.end('Connected');
    }
  });

  httpServer.listen(port, () => {
    console.log(`SSE server listening on port ${port}`);
  });
}
