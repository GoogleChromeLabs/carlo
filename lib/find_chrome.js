/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const puppeteer = require('puppeteer-core');

const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;
const execFileSync = require('child_process').execFileSync;

const newLineRegex = /\r?\n/;

function darwin() {
  const suffixes = ['/Contents/MacOS/Google Chrome Canary', '/Contents/MacOS/Google Chrome'];
  const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework' +
      '/Versions/A/Frameworks/LaunchServices.framework' +
      '/Versions/A/Support/lsregister';

  const installations = [];

  const customChromePath = resolveChromePath();
  if (customChromePath)
    installations.push(customChromePath);

  execSync(
      `${LSREGISTER} -dump` +
      ' | grep -i \'google chrome\\( canary\\)\\?.app$\'' +
      ' | awk \'{$1=""; print $0}\'')
      .toString()
      .split(newLineRegex)
      .forEach(inst => {
        suffixes.forEach(suffix => {
          const execPath = path.join(inst.trim(), suffix);
          if (canAccess(execPath))
            installations.push(execPath);
        });
      });

  // Retains one per line to maintain readability.
  // clang-format off
  const priorities = [
    {regex: new RegExp(`^${process.env.HOME}/Applications/.*Chrome.app`), weight: 50},
    {regex: new RegExp(`^${process.env.HOME}/Applications/.*Chrome Canary.app`), weight: 51},
    {regex: /^\/Applications\/.*Chrome.app/, weight: 100},
    {regex: /^\/Applications\/.*Chrome Canary.app/, weight: 101},
    {regex: /^\/Volumes\/.*Chrome.app/, weight: -2},
    {regex: /^\/Volumes\/.*Chrome Canary.app/, weight: -1},
  ];

  if (process.env.CHROME_PATH)
    priorities.unshift({regex: new RegExp(`${process.env.CHROME_PATH}`), weight: 151});

  // clang-format on
  return sort(installations, priorities);
}

function resolveChromePath() {
  if (canAccess(`${process.env.CHROME_PATH}`))
    return process.env.CHROME_PATH;
  return '';
}

/**
 * Look for linux executables in 3 ways
 * 1. Look into CHROME_PATH env variable
 * 2. Look into the directories where .desktop are saved on gnome based distro's
 * 3. Look for google-chrome-stable & google-chrome executables by using the which command
 */
function linux() {
  let installations = [];

  // 1. Look into CHROME_PATH env variable
  const customChromePath = resolveChromePath();
  if (customChromePath)
    installations.push(customChromePath);

  // 2. Look into the directories where .desktop are saved on gnome based distro's
  const desktopInstallationFolders = [
    path.join(require('os').homedir(), '.local/share/applications/'),
    '/usr/share/applications/',
  ];
  desktopInstallationFolders.forEach(folder => {
    installations = installations.concat(findChromeExecutables(folder));
  });

  // Look for google-chrome(-stable) & chromium(-browser) executables by using the which command
  const executables = [
    'google-chrome-stable',
    'google-chrome',
    'chromium-browser',
    'chromium',
  ];
  executables.forEach(executable => {
    try {
      const chromePath =
          execFileSync('which', [executable], {stdio: 'pipe'}).toString().split(newLineRegex)[0];
      if (canAccess(chromePath))
        installations.push(chromePath);
    } catch (e) {
      // Not installed.
    }
  });

  if (!installations.length)
    throw new Error('The environment variable CHROME_PATH must be set to executable of a build of Chromium version 54.0 or later.');

  const priorities = [
    {regex: /chrome-wrapper$/, weight: 51},
    {regex: /google-chrome-stable$/, weight: 50},
    {regex: /google-chrome$/, weight: 49},
    {regex: /chromium-browser$/, weight: 48},
    {regex: /chromium$/, weight: 47},
  ];

  if (process.env.CHROME_PATH)
    priorities.unshift({regex: new RegExp(`${process.env.CHROME_PATH}`), weight: 101});

  return sort(uniq(installations.filter(Boolean)), priorities);
}

function win32() {
  const installations = [];
  const suffixes = [
    `${path.sep}Google${path.sep}Chrome SxS${path.sep}Application${path.sep}chrome.exe`,
    `${path.sep}Google${path.sep}Chrome${path.sep}Application${path.sep}chrome.exe`
  ];
  const prefixes = [
    process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']
  ].filter(Boolean);

  const customChromePath = resolveChromePath();
  if (customChromePath)
    installations.push(customChromePath);

  prefixes.forEach(prefix => suffixes.forEach(suffix => {
    const chromePath = path.join(prefix, suffix);
    if (canAccess(chromePath))
      installations.push(chromePath);
  }));
  return installations;
}

function sort(installations, priorities) {
  const defaultPriority = 10;
  return installations
      // assign priorities
      .map(inst => {
        for (const pair of priorities) {
          if (pair.regex.test(inst))
            return {path: inst, weight: pair.weight};
        }
        return {path: inst, weight: defaultPriority};
      })
      // sort based on priorities
      .sort((a, b) => (b.weight - a.weight))
      // remove priority flag
      .map(pair => pair.path);
}

function canAccess(file) {
  if (!file)
    return false;

  try {
    fs.accessSync(file);
    return true;
  } catch (e) {
    return false;
  }
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function findChromeExecutables(folder) {
  const argumentsRegex = /(^[^ ]+).*/; // Take everything up to the first space
  const chromeExecRegex = '^Exec=\/.*\/(google-chrome|chrome|chromium)-.*';

  const installations = [];
  if (canAccess(folder)) {
    // Output of the grep & print looks like:
    //    /opt/google/chrome/google-chrome --profile-directory
    //    /home/user/Downloads/chrome-linux/chrome-wrapper %U
    let execPaths;

    // Some systems do not support grep -R so fallback to -r.
    // See https://github.com/GoogleChrome/chrome-launcher/issues/46 for more context.
    try {
      execPaths = execSync(`grep -ER "${chromeExecRegex}" ${folder} | awk -F '=' '{print $2}'`);
    } catch (e) {
      execPaths = execSync(`grep -Er "${chromeExecRegex}" ${folder} | awk -F '=' '{print $2}'`);
    }

    execPaths = execPaths.toString()
        .split(newLineRegex)
        .map(execPath => execPath.replace(argumentsRegex, '$1'));

    execPaths.forEach(execPath => canAccess(execPath) && installations.push(execPath));
  }

  return installations;
}

/**
 * @param {!Array<string>} configurations
 * @return {!Promise<!Array<string>>}
 */
async function installations(configurations) {
  if (configurations[0] === 'chromium')
    return [await downloadChromium()];
  if (configurations[0].startsWith('r'))
    return [await downloadChromium(configurations[0].substr(1))];
  let paths = [];
  if (process.platform === 'linux')
    paths = linux();
  else if (process.platform === 'win32')
    paths = win32();
  else if (process.platform === 'darwin')
    paths = darwin();
  if (paths.length === 0 && configurations[0] === '*')
    return [await downloadChromium()];
  return paths;
}

/**
 * @param {string=} targetRevision
 * @return {!Promise<?string>}
 */
async function downloadChromium(targetRevision) {
  const downloadHost = process.env.CARLO_DOWNLOAD_HOST || process.env.npm_config_carlo_download_host;

  const browserFetcher = puppeteer.createBrowserFetcher({ host: downloadHost });

  const defaultCarloRevision = '599821';
  const revision = targetRevision || process.env.CARLO_CHROMIUM_REVISION || process.env.npm_config_carlo_chromium_revision
    || defaultCarloRevision;

  const revisionInfo = browserFetcher.revisionInfo(revision);

  // Do nothing if the revision is already downloaded.
  if (revisionInfo.local)
    return revisionInfo.executablePath;

  // Override current environment proxy settings with npm configuration, if any.
  const NPM_HTTPS_PROXY = process.env.npm_config_https_proxy || process.env.npm_config_proxy;
  const NPM_HTTP_PROXY = process.env.npm_config_http_proxy || process.env.npm_config_proxy;
  const NPM_NO_PROXY = process.env.npm_config_no_proxy;

  if (NPM_HTTPS_PROXY)
    process.env.HTTPS_PROXY = NPM_HTTPS_PROXY;
  if (NPM_HTTP_PROXY)
    process.env.HTTP_PROXY = NPM_HTTP_PROXY;
  if (NPM_NO_PROXY)
    process.env.NO_PROXY = NPM_NO_PROXY;

  let progressBar = null;
  let lastDownloadedBytes = 0;
  try {
    await browserFetcher.download(revisionInfo.revision, onProgress);
    let localRevisions = await browserFetcher.localRevisions();
    console.log('Chromium downloaded to ' + revisionInfo.folderPath);
    localRevisions = localRevisions.filter(revision => revision !== revisionInfo.revision);
    // Remove previous chromium revisions.
    const cleanupOldVersions = localRevisions.map(revision => browserFetcher.remove(revision));
    await Promise.all(cleanupOldVersions);
    return browserFetcher.revisionInfo(revision).executablePath;
  } catch (error) {
    console.error(`ERROR: Failed to download Chromium r${revision}! Set "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" env variable to skip download.`);
    console.error(error);
    return null;
  }

  function onProgress(downloadedBytes, totalBytes) {
    if (!progressBar) {
      const ProgressBar = require('progress');
      progressBar = new ProgressBar(`Downloading Chromium r${revision} - ${toMegabytes(totalBytes)} [:bar] :percent :etas `, {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: totalBytes,
      });
    }
    const delta = downloadedBytes - lastDownloadedBytes;
    lastDownloadedBytes = downloadedBytes;
    progressBar.tick(delta);
  }

  function toMegabytes(bytes) {
    const mb = bytes / 1024 / 1024;
    return `${Math.round(mb * 10) / 10} Mb`;
  }
}

module.exports = installations;

