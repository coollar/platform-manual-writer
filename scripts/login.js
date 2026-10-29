/*
 * login.js —— 登录目标平台，产出 Playwright storageState（state.json）
 *
 * 用法：
 *   MANUAL_LOGIN_URL="https://<平台>/login?redirect=%2F" \
 *   MANUAL_USER="<账号>" MANUAL_PASS="<密码>" \
 *   MANUAL_STATE_OUT="./state.json" \
 *   [MANUAL_USER_SEL="#username"] [MANUAL_PASS_SEL="#password"] \
 *   [MANUAL_SUBMIT_SEL="button:has-text('登')"] \
 *   [CHROME_PATH="<Chrome 可执行文件路径；不设则按平台自动探测>"] \
 *   NODE_PATH="<node-workspace>/node_modules" node login.js
 *
 * 产出：
 *   - <MANUAL_STATE_OUT>  登录态（后续脚本 newContext({storageState}) 复用）
 *   - login_filled.png / login_after.png  过程截图（便于排错）
 */
const { chromium } = require('playwright-core');
const path = require('path');
const { resolveChrome, chromeHint, defaultUserAgent } = require('./chrome_path');

const LOGIN_URL = process.env.MANUAL_LOGIN_URL;
const USER = process.env.MANUAL_USER;
const PASS = process.env.MANUAL_PASS;
const STATE_OUT = process.env.MANUAL_STATE_OUT || './state.json';
const USER_SEL = process.env.MANUAL_USER_SEL || '#username';
const PASS_SEL = process.env.MANUAL_PASS_SEL || '#password';
const SUBMIT_SEL = process.env.MANUAL_SUBMIT_SEL || 'button:has-text("登")';
const CHROME = resolveChrome(); // 环境变量 CHROME_PATH 优先，否则按平台探测

// 截图输出到 state.json 同目录
const OUT_DIR = path.dirname(path.resolve(STATE_OUT)) + path.sep;

if (!LOGIN_URL || !USER || !PASS) {
  console.error(
    '缺少环境变量：需要 MANUAL_LOGIN_URL / MANUAL_USER / MANUAL_PASS'
  );
  process.exit(2);
}
if (!CHROME) {
  console.error(chromeHint());
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    executablePath: CHROME,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 950 },
    locale: 'zh-CN',
    userAgent: process.env.MANUAL_UA || defaultUserAgent(),
  });
  const page = await ctx.newPage();

  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/api/') || u.includes('/auth/')) {
      let body = '';
      try {
        body = (await r.text()).slice(0, 500);
      } catch (e) {}
      console.log('[API]', r.status(), r.request().method(), u, '=>', body);
    }
  });

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector(USER_SEL, { timeout: 20000 });
  await page.waitForTimeout(1200);

  await page.fill(USER_SEL, USER);
  await page.fill(PASS_SEL, PASS);
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT_DIR + 'login_filled.png' });

  // 部分平台有「记住密码」复选框
  const cb = await page.$('.ant-checkbox-input');
  if (cb) await cb.check().catch(() => {});

  await page.click(SUBMIT_SEL);
  await page.waitForTimeout(6000);

  console.log('AFTER LOGIN URL:', page.url());
  console.log(
    'BODY:',
    (await page.evaluate(() => document.body.innerText)).slice(0, 800)
  );
  await page.screenshot({ path: OUT_DIR + 'login_after.png' });

  await ctx.storageState({ path: STATE_OUT });
  console.log('登录态已写入:', path.resolve(STATE_OUT));
  await browser.close();
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
