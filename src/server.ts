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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

import { Context } from './context';

import type { Tool } from './tools/tool';
import type { Resource } from './resources/resource';
import type { BrowserType } from 'playwright';
import { CDPLaunchOptions } from './context';
import { getVisibleText } from './tools/common';

type Options = {
  name: string;
  version: string;
  tools: Tool[];
  resources: Resource[];
  userDataDir: string;
  launchOptions?: CDPLaunchOptions;
  browserType?: BrowserType;
  wsEndpoint?: string;
};

export function createServerWithTools(options: Options): Server {
  const { name, version, tools, resources, userDataDir, launchOptions, browserType, wsEndpoint } = options;
  console.log('Creating server with options:', {
    name, version, userDataDir, 
    launchOptions: { ...launchOptions, args: launchOptions?.args?.length ? launchOptions.args : undefined },
    browserType: browserType?.name,
    wsEndpoint
  });
  
  const context = new Context(userDataDir, launchOptions, browserType, wsEndpoint);
  const server = new Server({ name, version, wsEndpoint }, {
    capabilities: {
      tools: {},
      resources: {},
    }
  });

  // Add common tools
  const allTools = [...tools, getVisibleText];

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    return { tools: allTools.map(tool => tool.schema) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = request.params;
    const tool = allTools.find(t => t.schema.name === params.name);
    if (!tool) {
      return {
        content: [{
          type: 'text',
          text: `Tool "${params.name}" not found`
        }],
        isError: true
      };
    }
    return await tool.handle(context, params.arguments);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    return { resources: resources.map(resource => resource.schema) };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const params = request.params;
    const resource = resources.find(r => r.schema.uri === params.uri);
    if (!resource) {
      return {
        content: [{
          type: 'text',
          text: `Resource "${params.uri}" not found`
        }],
        isError: true
      };
    }
    const result = await resource.read(context, params.uri);
    return {
      content: result.map(r => ({
        type: r.mimeType,
        text: r.text
      })),
      isError: false
    };
  });

  const oldClose = server.close.bind(server);

  server.close = async () => {
    await oldClose();
    await context.close();
  };

  return server;
}

export class ServerList {
  private _servers: Server[] = [];
  private _serverFactory: () => Server;

  constructor(serverFactory: () => Server) {
    this._serverFactory = serverFactory;
  }

  async create(): Promise<Server> {
    const server = this._serverFactory();
    this._servers.push(server);
    return server;
  }

  async close(server: Server): Promise<void> {
    const index = this._servers.indexOf(server);
    if (index !== -1)
      this._servers.splice(index, 1);
    await server.close();
  }

  async closeAll(): Promise<void> {
    await Promise.all(this._servers.map(server => server.close()));
  }
}
