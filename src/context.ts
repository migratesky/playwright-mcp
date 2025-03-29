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

import { chromium, Browser, BrowserContext, Page, BrowserType, ConsoleMessage, FileChooser, Frame, FrameLocator, Locator, LaunchOptions } from 'playwright';

export interface CDPLaunchOptions extends LaunchOptions {
  wsEndpoint?: string;
  userDataDir?: string;
}

export class Context {
  private _browser: Browser | null = null;
  private _context: BrowserContext | null = null;
  private _page: Page | null = null;
  private _console: ConsoleMessage[] = [];
  private _fileChooser: FileChooser | undefined;
  private _lastSnapshotFrames: Frame[] = [];

  constructor(
    private readonly _userDataDir: string,
    private readonly _launchOptions: CDPLaunchOptions,
    private readonly _browserType: BrowserType = chromium,
    private readonly _wsEndpoint?: string
  ) {}

  async getBrowser(): Promise<Browser> {
    if (!this._browser) {
      console.log('Getting browser instance...');
      console.log('Launch options:', this._launchOptions);
      console.log('Browser type:', this._browserType.name);
      console.log('WS Endpoint:', this._wsEndpoint);
      
      if (this._wsEndpoint) {
        console.log('Connecting to existing browser via CDP...');
        this._browser = await this._browserType.connect({ 
          wsEndpoint: this._wsEndpoint,
          timeout: 30000 
        });
        console.log('Connected to browser via CDP');
      } else {
        console.log('Launching new browser instance...');
        this._browser = await this._browserType.launch({
          ...this._launchOptions,
          userDataDir: this._userDataDir,
        });
        console.log('New browser instance launched');
      }
    }
    return this._browser;
  }

  async getBrowserContext(): Promise<BrowserContext> {
    if (!this._context) {
      const browser = await this.getBrowser();
      this._context = await browser.newContext();
    }
    return this._context;
  }

  async getPage(): Promise<Page> {
    if (!this._page) {
      const context = await this.getBrowserContext();
      this._page = await context.newPage();
      this._page.on('console', (event) => this._console.push(event));
      this._page.on('framenavigated', (frame) => {
        if (!frame.parentFrame())
          this._console.length = 0;
      });
      this._page.on('close', () => this._onPageClose());
      this._page.on('filechooser', (chooser) => this._fileChooser = chooser);
      this._page.setDefaultNavigationTimeout(60000);
      this._page.setDefaultTimeout(5000);
    }
    return this._page;
  }

  async close(): Promise<void> {
    if (this._page) {
      await this._page.close();
      this._page = null;
    }
    if (this._context) {
      await this._context.close();
      this._context = null;
    }
    if (this._browser) {
      await this._browser.close();
      this._browser = null;
    }
  }

  private _onPageClose(): void {
    this._console.length = 0;
    this._fileChooser = undefined;
  }

  async console(): Promise<ConsoleMessage[]> {
    return this._console;
  }

  async submitFileChooser(paths: string[]): Promise<void> {
    if (!this._fileChooser)
      throw new Error('No file chooser visible');
    await this._fileChooser.setFiles(paths);
    this._fileChooser = undefined;
  }

  async allFramesSnapshot(): Promise<string> {
    const page = await this.getPage();
    const visibleFrames = await page.locator('iframe').filter({ visible: true }).all();
    this._lastSnapshotFrames = visibleFrames.map((frame) => frame.contentFrame());

    const snapshots: string[] = [];
    for (const frame of this._lastSnapshotFrames) {
      const frameContent = await frame.content();
      if (frameContent)
        snapshots.push(frameContent);
    }
    return snapshots.join('\n');
  }

  refLocator(ref: string): Locator {
    const page = this.existingPage();
    let frame: Frame | FrameLocator = page.mainFrame();
    const match = ref.match(/^f(\d+)(.*)/);
    if (match) {
      const frameIndex = parseInt(match[1], 10);
      if (frameIndex >= this._lastSnapshotFrames.length)
        throw new Error(`Frame ${frameIndex} not found`);
      frame = this._lastSnapshotFrames[frameIndex];
    }
    const selector = match ? match[2] : ref;
    return frame.locator(selector);
  }

  existingPage(): Page {
    if (!this._page)
      throw new Error('Navigate to a location to create a page');
    return this._page;
  }
}
