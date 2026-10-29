/*
 * chrome_path.js —— 跨平台 Chrome 路径探测
 *
 * 为什么需要：
 *   原先脚本把 Chrome 路径写死成 Windows 的
 *   `C:\Program Files\Google\Chrome\Application\chrome.exe`，
 *   在 macOS / Linux 上必失败。本模块按平台自动探测。
 *
 * 用法：
 *   const { resolveChrome } = require('./chrome_path');
 *   const CHROME = resolveChrome();      // 返回路径或 null
 *
 * 优先级：
 *   1. 环境变量 CHROME_PATH（用户显式指定，原样采用）
 *   2. 按当前平台探测常见安装位置
 *   3. 未找到 → 返回 null，由调用方给出提示
 *
 * ⚠️ 本文件在 platform-manual-writer 与 web-ui-probe 两处同源，改动需两侧同步。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function winPaths() {
  const local = process.env.LOCALAPPDATA || '';
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    local ? path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  ];
}

function macPaths() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
}

function linuxPaths() {
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

function firstExisting(list) {
  for (const p of list) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return null;
}

function which(cmd) {
  try {
    const out = execSync('command -v ' + cmd, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out || null;
  } catch (e) {
    return null;
  }
}

function resolveChrome() {
  // 1) 用户显式指定优先（即使存在性问题，也尊重用户意图）
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  // 2) 按平台探测
  let found = null;
  if (process.platform === 'win32') {
    found = firstExisting(winPaths());
  } else if (process.platform === 'darwin') {
    found = firstExisting(macPaths());
    if (!found) found = which('google-chrome') || which('chromium');
  } else {
    found = firstExisting(linuxPaths());
    if (!found) {
      for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
        found = which(c);
        if (found) break;
      }
    }
  }
  return found;
}

/**
 * 取不到 Chrome 时的统一提示文案。
 */
function chromeHint() {
  return [
    '未找到 Chrome。请用环境变量 CHROME_PATH 指定可执行文件，例如：',
    '  macOS   export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"',
    '  Windows set CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
    '  Linux   export CHROME_PATH="$(command -v google-chrome)"',
  ].join('\n');
}

/**
 * 按平台生成真实浏览器 UA（避免在 Mac 上伪装成 Windows）。
 */
function defaultUserAgent() {
  if (process.platform === 'darwin') {
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  }
  if (process.platform === 'linux') {
    return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
}

module.exports = { resolveChrome, chromeHint, defaultUserAgent };
