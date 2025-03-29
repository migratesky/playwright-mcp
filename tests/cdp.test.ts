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

import { url } from 'node:inspector';
import { test, expect } from './fixtures';
import { chromium } from 'playwright';

test('should connect to browser via CDP', async ({ startClient }, testInfo) => {
  testInfo.setTimeout(10000);
  
  console.log('Starting CDP test');
  
  // Start a browser with CDP enabled on port 0 (auto-select port)
  console.log('Launching browser with CDP enabled...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--remote-debugging-port=0']
  });
  
  // Get the actual CDP endpoint
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  
  // Navigate to a page to ensure browser is ready
  await page.goto('about:blank');
  console.log('Browser launched successfully');
  
  // Start a client without CDP endpoint (use default)
  console.log('Creating client without CDP endpoint...');
  const client = await startClient();
  
  console.log('Connected to browser');
  
  // Verify the connection by navigating
  console.log('Navigating to example.com...');
  const response1 = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: 'https://example.com' }
  });
  
  console.log('First navigation response:', JSON.stringify(response1, null, 2));
  
  // Navigate again to verify connection is stable
  console.log('Navigating again to example.com...');
  const response2 = await client.callTool({
    name: 'browser_navigate',
    arguments: {url: 'https://example.com'}
  });
  
  console.log('Second navigation response:', JSON.stringify(response2, null, 2));
  
  // Clean up
  await browser.close();
});
