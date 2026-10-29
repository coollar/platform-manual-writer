/*
 * inventory_buttons.js —— 按钮穷举清点
 *
 * 用途：把一个页面上的【所有可点击元素】翻出来并记清楚，产出按钮清单 JSON，
 *       供写手册（矩阵表）与复查（逐行变断言）使用。
 *       重点覆盖：无文字纯图标按钮、禁用态按钮、行内操作按钮、表格行操作列。
 *
 * 用法：
 *   MANUAL_BASE_URL="https://<平台>" \
 *   MANUAL_PAGE="<进入该页需点击的界面文本，如 '采标方案'，留空则用当前位置>" \
 *   MANUAL_STATE="./state.json" \
 *   [MANUAL_OUT="./buttons.json"] \
 *   [HOVER_ICONS=1]        # 对无文字图标逐个悬停，读取 tooltip 文本（慢，但强烈建议开）
 *   [INCLUDE_NAV=0]        # 是否包含左侧导航/顶部菜单（默认 0，一般不需写入手册）
 *   NODE_PATH="<node-workspace>/node_modules" node inventory_buttons.js
 *
 * 产出：
 *   - <MANUAL_OUT>  按钮清单 JSON（含区域分组、行操作列、禁用态、悬停提示、几何位置）
 *   - inventory.png 当前页面截图（留证）
 *
 * ⚠️ 本脚本【只读】：只扫描 DOM 与悬停，不点击任何按钮。
 *    需要点开菜单/抽屉才能看到的按钮，用末尾的 dumpMenu()/dumpDrawer() 手动调用。
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { resolveChrome, chromeHint } = require('./chrome_path');

const BASE = process.env.MANUAL_BASE_URL;
const PAGE_HINT = process.env.MANUAL_PAGE || '';
const STATE = process.env.MANUAL_STATE || './state.json';
const OUT = process.env.MANUAL_OUT || './buttons.json';
const HOVER_ICONS = process.env.HOVER_ICONS !== '0'; // 默认开
const INCLUDE_NAV = process.env.INCLUDE_NAV === '1';
const CHROME = resolveChrome(); // 环境变量 CHROME_PATH 优先，否则按平台探测

if (!BASE) {
  console.error('缺少环境变量 MANUAL_BASE_URL');
  process.exit(2);
}
if (!CHROME) {
  console.error(chromeHint());
  process.exit(2);
}

let page = null;
const sleep = (ms) => page.waitForTimeout(ms);

// ---------------- 扫描：页面上所有可点击元素 ----------------
// 返回 { area, tag, text, aria, title, icon, disabled, visible, w, h, x, y }
async function scanButtons() {
  return page.evaluate((includeNav) => {
    const NAV_HINT = /ant-menu|ant-layout-sider|ant-layout-header|ant-breadcrumb/;
    const ICON_CLS = /anticon|ant-btn-icon|icon-|svg/i;

    // 判断元素可见（排除 display:none / 0 尺寸）
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden';
    };

    // 归属区域：按最近的语义容器推断（顺序即优先级）
    const areaOf = (el) => {
      // 1) 导航：沿祖先链找导航类容器
      let p = el;
      while (p && p !== document.body) {
        if (NAV_HINT.test(String(p.className || ''))) return '导航';
        p = p.parentElement;
      }
      if (el.closest('.ant-drawer')) return '抽屉';
      if (el.closest('.ant-modal')) return '弹窗';
      if (el.closest('.ant-dropdown-menu, .ant-menu-submenu-popup, .ant-select-dropdown'))
        return '下拉菜单';
      // 2) 表格：细分到「勾选/首列」「行操作列」「行内其他列」
      const tr = el.closest('.ant-table-tbody tr');
      if (tr) {
        const tds = Array.from(tr.querySelectorAll('td'));
        const cell = el.closest('td');
        const i = cell ? tds.indexOf(cell) : -1;
        if (i === 0) return '表格勾选/首列';
        if (i === tds.length - 1) return '表格行操作';
        return '表格行内';
      }
      if (el.closest('.ant-table-thead, .ant-table-filter-trigger')) return '表头/筛选';
      if (el.closest('.ant-tabs-tab, .ant-tabs-nav')) return 'Tab 栏';
      if (el.closest('.ant-pagination')) return '分页区';
      // 3) 顶部主按钮与筛选区难以再细分，合并为「工具栏/筛选区」
      return '工具栏/筛选区';
    };

    const out = [];
    const seen = new Set();
    const sel =
      'button, a[href], [role="button"], .ant-btn, .anticon, .ant-dropdown-trigger, .ant-checkbox-wrapper, .ant-switch, .ant-table-filter-trigger';

    document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const area = areaOf(el);
      if (!includeNav && (area === '导航')) return;
      if (!visible(el)) return;

      const r = el.getBoundingClientRect();
      const cls = String(el.className || '');
      const txt = (el.innerText || '').trim().replace(/\s+/g, ' ');
      const aria = el.getAttribute('aria-label') || '';
      const title = el.getAttribute('title') || '';
      // 取 svg 的 data-icon（Ant 常用 anticon-xxx）
      const svg = el.querySelector('svg[data-icon], .anticon');
      const iconName = svg
        ? (svg.getAttribute && svg.getAttribute('data-icon')) ||
          (String(svg.className && svg.className.baseVal || svg.className || '').match(/anticon-([a-z-]+)/) || [])[1] ||
          ''
        : '';
      const disabled =
        el.disabled === true ||
        cls.includes('disabled') ||
        el.getAttribute('aria-disabled') === 'true';

      // 是否是无文字图标按钮（重点对象）：文本为空或纯符号（⧉ ⋯ ▾），且有图标特征
      const hasText = /[A-Za-z0-9\u4e00-\u9fa5]/.test(txt);
      const isIconOnly = !hasText && (!!iconName || ICON_CLS.test(cls));

      out.push({
        area,
        tag: el.tagName.toLowerCase(),
        text: txt.slice(0, 60),
        aria: aria.slice(0, 60),
        title: title.slice(0, 60),
        icon: iconName,
        iconOnly: isIconOnly,
        disabled,
        cls: cls.slice(0, 120),
        w: Math.round(r.width),
        h: Math.round(r.height),
        x: Math.round(r.x),
        y: Math.round(r.y),
      });
    });
    return out;
  }, INCLUDE_NAV);
}

// ---------------- 表格：逐行按状态列出行操作列按钮 ----------------
async function scanRowActions() {
  return page.evaluate(() => {
    const tables = document.querySelectorAll('.ant-table-tbody');
    const last = tables[tables.length - 1];
    if (!last) return [];
    const rows = Array.from(last.querySelectorAll('tr.ant-table-row'));
    return rows.map((row) => {
      const tds = Array.from(row.querySelectorAll('td'));
      const lastCell = tds[tds.length - 1];
      const btns = lastCell
        ? Array.from(lastCell.querySelectorAll('button, a[href], [role="button"], .ant-btn, .anticon, .ant-dropdown-trigger'))
            .filter((b) => !(b.parentElement && b.parentElement.closest('.ant-btn'))) // 去掉按钮内嵌套的图标，避免重复
            .map((b) => {
            const t = (b.innerText || '').trim().replace(/\s+/g, ' ');
            const svg = b.querySelector('svg[data-icon], .anticon');
            const ic = svg
              ? (svg.getAttribute && svg.getAttribute('data-icon')) ||
                (String((svg.className && svg.className.baseVal) || svg.className || '').match(/anticon-([a-z-]+)/) || [])[1] || ''
              : '';
            return {
              text: t.slice(0, 30),
              icon: ic,
              disabled: String(b.className || '').includes('disabled'),
              cls: String(b.className || '').slice(0, 60),
            };
          })
        : [];
      return {
        rowName: (tds[0] ? tds[0].innerText : '').trim().slice(0, 40),
        // 行状态线索：整行文本里常见的状态词
        stateHint: (() => {
          const t = row.innerText || '';
          const m = t.match(/草稿|已发布|已归档|启用|停用|已关闭|已归档|正常|异常/);
          return m ? m[0] : '';
        })(),
        actions: btns,
      };
    });
  });
}

// ---------------- 悬停读 tooltip（无文字图标专用） ----------------
async function hoverTooltips() {
  // 找到所有无文字图标元素，逐个 hover，读当前可见 tooltip（读不到则回退 title 属性）
  const handles = await page.$$(
    '.anticon, .ant-table-tbody [class*="icon"], .ant-dropdown-trigger, .ant-btn i'
  );
  const tips = [];
  for (const h of handles.slice(0, 60)) {
    try {
      const info = await h.evaluate((el) => ({
        txt: (el.innerText || '').trim(),
        title:
          el.getAttribute('title') ||
          (el.closest('[title]') ? el.closest('[title]').getAttribute('title') : '') ||
          '',
      }));
      // 有真实文字（含字母/数字/汉字）的跳过，只处理图标
      if (/[A-Za-z0-9\u4e00-\u9fa5]/.test(info.txt)) continue;
      await h.scrollIntoViewIfNeeded().catch(() => {});
      await h.hover({ timeout: 1500 });
      await page.waitForTimeout(450);
      // 注意：必须给 innerText 传短超时；否则元素不存在时会等满默认 30s，N 个图标就把脚本拖死
      let tip = '';
      try {
        tip = await page
          .locator('.ant-tooltip:not(.ant-tooltip-hidden), [role="tooltip"]')
          .first()
          .innerText({ timeout: 1200 });
      } catch (e) {
        /* 无 tooltip，走 title 回退 */
      }
      if (!tip) tip = info.title || ''; // ant-tooltip 不存在时回退原生 title
      const box = await h.boundingBox();
      tips.push({
        tip: (tip || '').trim().slice(0, 40) || '(无提示)',
        x: box ? Math.round(box.x) : null,
        y: box ? Math.round(box.y) : null,
      });
      await page.mouse.move(5, 5);
      await page.waitForTimeout(150);
    } catch (e) {
      /* 悬停失败跳过，不影响主流程 */
    }
  }
  return tips;
}

// ---------------- 手动辅助：点开后才可见的按钮 ----------------
// 用法：在下面主流程末尾按需调用，例如
//   await dumpAfterClick('button:has-text("新建")', '抽屉');
//   await dumpAfterClick('.ant-table-tbody tr:first-child .ant-dropdown-trigger', '卡片菜单');
async function dumpAfterClick(selector, label) {
  await page.click(selector, { timeout: 5000 }).catch((e) => console.log('click fail:', e.message));
  await sleep(1000);
  const items = await page.evaluate(() => {
    const root = document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden), .ant-drawer-content, .ant-modal-content');
    if (!root) return [];
    return Array.from(root.querySelectorAll('button, .ant-dropdown-menu-item, .ant-menu-item, li')).map((x) => ({
      text: (x.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      disabled: String(x.className || '').includes('disabled'),
    }));
  });
  console.log('\n--- ' + label + ' 内按钮 ---');
  items.forEach((i) => console.log((i.disabled ? '[禁用] ' : '      ') + i.text));
  return items;
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

  // 可选：按界面文本进入目标页（不用 URL，符合手册约定）
  if (PAGE_HINT) {
    await page.click(`text=${PAGE_HINT}`, { timeout: 8000 }).catch(() => {});
    await sleep(2500);
  }
  // 表格类页面建议先等表格出现
  await page.waitForSelector('.ant-table-tbody, .ant-card, .ant-empty', { timeout: 15000 }).catch(() => {});
  await sleep(1000);

  const all = await scanButtons();
  const rows = await scanRowActions();
  const tips = HOVER_ICONS ? await hoverTooltips() : [];

  const report = {
    url_used: page.url().replace(/[?#].*$/, ''), // 只留页面级，便于自查（不写入手册）
    page_hint: PAGE_HINT,
    total: all.length,
    iconOnly: all.filter((b) => b.iconOnly).length,
    disabled: all.filter((b) => b.disabled).map((b) => b.text || b.icon || b.aria),
    byArea: {},
    rows,
    tooltips: tips,
  };
  all.forEach((b) => {
    (report.byArea[b.area] = report.byArea[b.area] || []).push(b);
  });

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  await page.screenshot({ path: path.dirname(path.resolve(OUT)) + '/inventory.png', fullPage: true });

  // ---------------- 控制台摘要 ----------------
  console.log('\n================ 按钮清点摘要 ================');
  console.log('可点击元素合计: %d（其中无文字图标 %d，禁用 %d）', report.total, report.iconOnly, report.disabled.length);
  Object.keys(report.byArea).forEach((area) => {
    const list = report.byArea[area];
    console.log('\n【%s】%d 个', area, list.length);
    list.forEach((b) => {
      const name =
        b.text ||
        (b.icon ? `<${b.icon}>` : '') ||
        b.aria ||
        b.title ||
        '(' + ((b.cls || '').split(' ')[0] || b.tag) + ')'; // 无名元素回退到类名，如 (ant-checkbox-wrapper)
      console.log('  ' + (b.disabled ? '[禁用] ' : '       ') + name + (b.iconOnly ? '  ← 无文字图标' : ''));
    });
  });

  if (rows.length) {
    console.log('\n------------- 表格行操作列（逐行） -------------');
    rows.slice(0, 12).forEach((r) => {
      console.log('· %s %s', r.stateHint ? `[${r.stateHint}]` : '', r.rowName);
      r.actions.forEach((a) => {
        const n =
          a.text ||
          (a.icon ? `<${a.icon}>` : '') ||
          '(' + ((a.cls || '').split(' ')[0] || '?') + ')';
        console.log('    - ' + (a.disabled ? '[禁用] ' : '') + n);
      });
    });
  }

  if (tips.length) {
    console.log('\n------------- 无文字图标悬停提示 -------------');
    tips.forEach((t) => console.log('  (' + t.x + ',' + t.y + ') → ' + t.tip));
  }

  console.log('\n清单已写入: %s', path.resolve(OUT));
  console.log('提示：菜单 / 抽屉里的按钮需点开才可见，用文件内 dumpAfterClick() 手动补扫。');
  console.log('==============================================');

  await browser.close();
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
