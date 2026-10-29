/*
 * audit_template.js —— 成品实机复查脚手架
 *
 * 用途：手册写完后，用【自建真实案例】逐条核对手册断言，输出 PASS/FAIL 汇总。
 *       每条断言一个 check()；只读断言与写操作闭环共用同一套收集。
 *
 * 用法：
 *   MANUAL_BASE_URL="https://<平台>" \
 *   MANUAL_STATE="./state.json" \
 *   MANUAL_SHOT_DIR="./audit_shots/" \
 *   TEST_PREFIX="ZZTEST_" \
 *   NODE_PATH="<node-workspace>/node_modules" \
 *   node audit_template.js
 *
 * 设计要点：
 *   - 复用阶段一的 state.json，不重复登录；被踢回登录页时明确报错退出
 *   - check(name, fn)：fn 返回 true = PASS；返回字符串 = FAIL 原因；抛错 = FAIL
 *   - 每条断言自动截图存档，便于举证
 *   - 结束打印 PASS/FAIL 清单与总数；有 FAIL 时退出码非 0
 *   - residueScan()：按 TEST_PREFIX 全平台搜残留（需按平台补充导航）
 *
 * ⚠️ 安全：所有写操作只在自建对象（带 TEST_PREFIX）上做；用完即清。
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const { resolveChrome, chromeHint } = require('./chrome_path');

const BASE = process.env.MANUAL_BASE_URL;
const STATE = process.env.MANUAL_STATE || './state.json';
const SHOTS = process.env.MANUAL_SHOT_DIR || './audit_shots/';
const PREFIX = process.env.TEST_PREFIX || 'ZZTEST_'; // 测试对象名前缀
const CHROME = resolveChrome(); // 环境变量 CHROME_PATH 优先，否则按平台探测

if (!BASE) {
  console.error('缺少环境变量 MANUAL_BASE_URL');
  process.exit(2);
}
if (!CHROME) {
  console.error(chromeHint());
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });

// ---------------- 断言收集 ----------------
const results = [];
let page = null;

async function check(name, fn) {
  const safe = name.replace(/[^\w\u4e00-\u9fa5]+/g, '_').slice(0, 60);
  try {
    const r = await fn();
    if (r === true || r === undefined) {
      results.push({ ok: true, name });
    } else {
      results.push({ ok: false, name, why: String(r) });
    }
  } catch (e) {
    results.push({ ok: false, name, why: e.message.split('\n')[0] });
  }
  // 顺手存证
  try {
    await page.screenshot({ path: SHOTS + safe + '.png' });
  } catch (e) {}
}

// ---------------- 通用小工具 ----------------
const sleep = (ms) => page.waitForTimeout(ms);

// 打开下拉，返回全部选项文本（用于核对枚举值）
async function readOptions(labelText) {
  const item = page
    .locator('.ant-form-item, .ant-select')
    .filter({ hasText: labelText })
    .first();
  await item.locator('.ant-select-selector').first().click({ force: true });
  await sleep(1000);
  const opts = await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .allInnerTexts();
  await page.keyboard.press('Escape');
  await sleep(300);
  return opts.map((s) => s.trim()).filter(Boolean);
}

// 读取某张表格的所有表头（用于核对列表列名）
async function readHeaders() {
  return page.evaluate(() => {
    const tables = document.querySelectorAll('.ant-table-tbody');
    const last = tables[tables.length - 1]; // 防止读到上一个 Tab 的残留表
    const table = last ? last.closest('.ant-table') : document.querySelector('.ant-table');
    if (!table) return [];
    return Array.from(table.querySelectorAll('.ant-table-thead th')).map((th) =>
      th.innerText.trim()
    );
  });
}

// 读取某行「操作」列的所有按钮 / 图标文本
async function readRowActions(rowText) {
  return page.evaluate((t) => {
    const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row'));
    const row = rows.find((r) => (r.innerText || '').includes(t));
    if (!row) return null;
    const last = row.querySelector('td:last-child');
    return last ? last.innerText.trim() : '';
  }, rowText);
}

// ---------------- 主流程 ----------------
(async () => {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    executablePath: CHROME,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1600, height: 950 },
    locale: 'zh-CN',
  });
  page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000);
  if (/login/i.test(page.url())) {
    console.error('登录态失效（被踢回登录页）。请先运行 scripts/login.js 刷新 state.json。');
    await browser.close();
    process.exit(3);
  }

  // ============================================================
  // 一、只读断言（打开抽屉 / 读表头 / 读枚举，不提交）
  // ============================================================
  // await check('【新建XX】抽屉标题与字段与手册一致', async () => {
  //   await page.goto(BASE + '/<path>', { waitUntil: 'domcontentloaded' });
  //   await sleep(3000);
  //   await page.click('button:has-text("新建")');
  //   await sleep(1200);
  //   const t = await page.locator('.ant-drawer-content').innerText().catch(() => '');
  //   if (!/新建XX/.test(t)) return '抽屉标题不是「新建XX」';
  //   if (!/任务用途.*必填/.test(t)) return '未看到「任务用途」必填标记';
  //   await page.keyboard.press('Escape');
  //   return true;
  // });
  //
  // await check('XX 列表列名与手册一致', async () => {
  //   const h = await readHeaders();
  //   const want = ['角色ID', '角色名称', '描述', '权限数', '类型', '成员数', '状态', '创建时间', '更新时间', '操作'];
  //   const miss = want.filter((x) => !h.includes(x));
  //   return miss.length ? '缺列：' + miss.join('、') + ' | 实际：' + h.join('、') : true;
  // });
  //
  // await check('状态筛选枚举 = 草稿/已发布/已归档', async () => {
  //   const opts = await readOptions('状态');
  //   const want = ['草稿', '已发布', '已归档'];
  //   const miss = want.filter((x) => !opts.includes(x));
  //   return miss.length ? '缺枚举：' + miss.join('、') + ' | 实际：' + opts.join('、') : true;
  // });

  // ============================================================
  // 二、写操作闭环断言（自建对象 -> 推到目标状态 -> 观察 -> 删除）
  //     覆盖【所有状态】与所有分支
  // ============================================================
  // 示例：验证「归档有二次确认、归档后操作列变化、且可删除」
  // await check('方案归档：有二次确认 / 归档后按钮变化 / 可删除', async () => {
  //   const name = PREFIX + 'plan_' + Date.now();
  //   // 1) 新建（用 name），保存
  //   // 2) 发布 —— 注意：先确认它有无二次确认，别想当然
  //   // 3) 点【归档】，捕获确认框文案
  //   const confirmTxt = await page
  //     .locator('.ant-popconfirm, .ant-modal-confirm')
  //     .innerText()
  //     .catch(() => '');
  //   if (!confirmTxt) return '归档无二次确认（手册说有）';
  //   // 4) 确认归档 -> 读取该行操作列，应为「查看 / 片段标注配置 / 删除」
  //   const acts = await readRowActions(name);
  //   if (!acts || !acts.includes('删除')) return '归档后操作列无「删除」：' + acts;
  //   // 5) 删除自建对象，确认消失
  //   // 6) 不留残留
  //   return true;
  // });
  //
  // 逐状态覆盖示例：草稿 / 已发布 / 已归档 三态各建一个对象，分别读操作列
  // await check('方案三态行操作与手册一致', async () => {
  //   // 为每个状态自建对象，读取该态操作列按钮，与手册表格逐项比对
  //   return true;
  // });

  // ============================================================
  // 三、边界 / 异常断言
  // ============================================================
  // await check('必填留空的提示语与手册一致', async () => { ... });
  // await check('只读字段不可编辑', async () => { ... });

  // ============================================================
  // 四、残留扫描（必须）
  // ============================================================
  // await residueScan();

  // ---------------- 汇总 ----------------
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log('\n================ 复查结果 ================');
  results.forEach((r) =>
    console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.why ? '  :: ' + r.why : ''))
  );
  console.log('------------------------------------------');
  console.log('总计 %d 条：PASS %d / FAIL %d', results.length, pass, fail.length);
  if (fail.length) console.log('\n⚠️ FAIL 需先分清是「手册错」还是「脚本错」，再决定改哪里。');

  await browser.close();
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
