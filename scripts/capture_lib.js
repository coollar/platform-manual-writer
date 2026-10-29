/*
 * capture_lib.js —— 截图 + 红框/圆形序号标注库
 *
 * 用法（在探查脚本里 require）：
 *   const { mark, clearMark, makeShot, findRect } = require('./capture_lib.js');
 *   const shot = await makeShot(page, DIR, results);   // 注意 await（makeShot 是 async）
 *   await shot('s01_list', [ { sel: '.ant-btn', n: 1 } ]);
 *
 * item 支持五种形态：
 *   { sel, i }                          —— Playwright 选择器第 i 个
 *   { sel, each:true, from }            —— 命中全部（最多 limit 个），从 from 起逐个编号
 *   { find:{txt,minW,maxW,minH,maxH} ,n} —— 按文本+尺寸定位最小容器（避免命中左侧导航）
 *   { txt:'确认', up:1, vis:true }       —— 按「精确文本」定位（推荐，比 find 稳），
 *                                          up = 向上找 N 级父元素再画框（画整个按钮/表单项），
 *                                          vis 默认 true = 只取可见元素（绕开隐藏弹层/抽屉里的同名元素）
 *   { x,y,w,h, n }                      —— 直接给坐标（顶栏/侧栏这类固定大区块用它）
 *
 * ⚠️ 输入框用 innerText 找不到（input 没有 innerText），一律走 { sel: 'input[placeholder="..."]' }。
 *
 * ⚠️⚠️ 每一项都要传 n（圆形序号）！不传 n 只会画一个光框、图上没有号码，图注里的
 *     「1 xxx，2 xxx」就与图对不上。n 的顺序 = 图注里的枚举顺序。
 *     例外：{ sel, each:true, from } 会自动从 from 起连续编号，不必逐项写 n。
 *     漏传时 mark() 会 console.warn，makeShot 的记录行会标 <<< NO-NUM，请务必扫一眼日志。
 *
 * 可选字段：color（默认红 #FF3B30）、pad（外扩像素，默认 3）
 */
async function findRect(page, f) {
  return page.evaluate((f) => {
    const all = Array.from(document.querySelectorAll('*')).filter((e) => {
      if (!new RegExp(f.txt).test(e.innerText || '')) return false;
      const r = e.getBoundingClientRect();
      if (f.minW && r.width < f.minW) return false;
      if (f.maxW && r.width > f.maxW) return false;
      if (f.minH && r.height < f.minH) return false;
      if (f.maxH && r.height > f.maxH) return false;
      if (f.maxTop != null && r.top > f.maxTop) return false;
      return true;
    });
    if (!all.length) return null;
    // 取满足约束的最小容器（最精确）
    all.sort((a, b) => {
      const ra = a.getBoundingClientRect(),
        rb = b.getBoundingClientRect();
      return ra.width * ra.height - rb.width * rb.height;
    });
    const r = all[0].getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, f);
}

async function mark(page, items) {
  const rects = [];
  for (const it of items) {
    try {
      if (it.find) {
        const r = await findRect(page, it.find);
        if (r) rects.push({ ...r, n: it.n, color: it.color, pad: it.pad });
      } else if (it.txt) {
        // 精确文本匹配（比 find 稳）：可向上取父级、可只取可见元素
        const r = await page.evaluate(
          ({ t, up, vis }) => {
            const n = (s) => (s || '').replace(/\s+/g, '');
            let c = [...document.querySelectorAll('button,.el-button,div,span,li,label,p,a')]
              .filter((e) => n(e.innerText) === t && e.children.length <= 3)
              .map((e) => {
                const r = e.getBoundingClientRect();
                return { e, r, a: r.width * r.height };
              })
              .filter((x) => x.r.width > 6 && x.r.height > 6);
            if (vis)
              c = c.filter((x) => {
                const cs = getComputedStyle(x.e);
                return cs.display !== 'none' && cs.visibility !== 'hidden';
              });
            if (!c.length) return null;
            c.sort((a, b) => a.a - b.a);
            let node = c[0].e;
            for (let i = 0; i < up; i++) if (node.parentElement) node = node.parentElement;
            const rr = node.getBoundingClientRect();
            return { x: rr.left, y: rr.top, w: rr.width, h: rr.height };
          },
          { t: it.txt.replace(/\s+/g, ''), up: it.up || 0, vis: it.vis !== false }
        );
        if (r) rects.push({ ...r, n: it.n, color: it.color, pad: it.pad });
      } else if (it.each && it.sel) {
        const loc = page.locator(it.sel);
        const c = Math.min(await loc.count(), it.limit || 12);
        for (let k = 0; k < c; k++) {
          const bb = await loc
            .nth(k)
            .boundingBox({ timeout: 2000 })
            .catch(() => null);
          if (bb && bb.width > 0)
            rects.push({
              x: bb.x,
              y: bb.y,
              w: bb.width,
              h: bb.height,
              n: (it.from || 1) + k,
              color: it.color,
              pad: it.pad,
            });
        }
      } else if (it.sel) {
        const loc = page.locator(it.sel).nth(it.i || 0);
        if (it.scroll !== false)
          await loc.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
        const bb = await loc.boundingBox({ timeout: 3000 });
        if (bb && bb.width > 0)
          rects.push({
            x: bb.x,
            y: bb.y,
            w: bb.width,
            h: bb.height,
            n: it.n,
            color: it.color,
            pad: it.pad,
          });
      } else if (it.x != null) rects.push(it);
    } catch (e) {
      /* skip */
    }
  }
  await page.evaluate((rects) => {
    document.querySelectorAll('.__anno').forEach((e) => e.remove());
    rects.forEach((it) => {
      const pad = it.pad == null ? 3 : it.pad;
      const c = it.color || '#FF3B30';
      const box = document.createElement('div');
      box.className = '__anno';
      box.style.cssText =
        'position:fixed;z-index:99998;pointer-events:none;border-radius:5px;border:2px solid ' +
        c +
        ';' +
        'left:' +
        (it.x - pad) +
        'px;top:' +
        (it.y - pad) +
        'px;width:' +
        (it.w + pad * 2) +
        'px;height:' +
        (it.h + pad * 2) +
        'px;';
      document.body.appendChild(box);
      if (it.n) {
        const bd = document.createElement('div');
        bd.className = '__anno';
        bd.textContent = it.n;
        bd.style.cssText =
          'position:fixed;z-index:99999;pointer-events:none;background:' +
          c +
          ';color:#fff;' +
          'font:700 12px/18px -apple-system,"PingFang SC",sans-serif;min-width:18px;height:18px;padding:0 5px;border-radius:9px;text-align:center;' +
          'left:' +
          Math.max(2, it.x - pad - 10) +
          'px;top:' +
          Math.max(2, it.y - pad - 10) +
          'px;box-shadow:0 1px 4px rgba(0,0,0,.28)';
        document.body.appendChild(bd);
      }
    });
  }, rects);
  // 兜底告警：命中了元素却一个序号都没传 —— 图上只有红框、没有号码
  if (rects.length && rects.every((r) => r.n == null)) {
    console.warn(
      '[capture_lib] mark(): 命中 ' +
        rects.length +
        ' 个元素但均无 n —— 只画红框、不画圆形序号。若图注是「1 xxx，2 xxx」式，请给每项补 n。'
    );
  }
  return rects.length;
}

async function clearMark(page) {
  await page.evaluate(() =>
    document.querySelectorAll('.__anno').forEach((e) => e.remove())
  );
}

/*
 * makeShot —— 生成一个 shot(name, items) 函数
 *   DIR     : 截图输出目录（含结尾分隔符）
 *   results : 结果数组，用于收集 OK/FAIL
 * 返回的函数是 async，调用时必须 await。
 */
async function makeShot(page, DIR, results) {
  return async function shot(name, items) {
    try {
      const n = items ? await mark(page, items) : 0;
      await page.waitForTimeout(420);
      await page.screenshot({ path: DIR + name + '.png' });
      await clearMark(page);
      const declared = items ? items.length : 0;
      const numbered = items
        ? items.filter((it) => it.n != null || it.each).length
        : 0;
      let tag = '';
      if (declared && !numbered) {
        tag = '  <<< NO-NUM：一个序号都没传，图上只有红框！';
        console.warn(
          '[capture_lib] shot(' + name + '): ' + declared + ' 项均无 n，另存图不会带圆形序号。'
        );
      } else if (declared && numbered < declared) {
        tag = '  <<< 部分缺号 ' + numbered + '/' + declared;
      }
      results.push(
        'OK   ' + name + (items ? '  (' + n + '/' + declared + ')' : '') + tag
      );
    } catch (e) {
      results.push('FAIL ' + name + ' :: ' + e.message.split('\n')[0]);
    }
  };
}

module.exports = { mark, clearMark, makeShot, findRect };
