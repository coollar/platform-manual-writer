# platform-manual-writer

为内部 Web 平台编写**图文并茂、经实机验证**的操作手册。核心不是"让 AI 写文档"，而是把一套被反复验证的流程固化下来：内容先在真实系统上点开看清，写完再用自建案例逐条证伪，最后发布到飞书云文档。

适用于任何有可登录 Web 界面的系统，不限具体平台。

## 四条红线

| 原则 | 说明 |
|---|---|
| 实机验证优先于一切 | 没在系统上看见的，不写 |
| 成品必须用自建案例上机复查 | 写完不算完，逐条证伪、覆盖所有状态 |
| 测试数据必带前缀、用完即清 | 生产环境不做无痕操作 |
| 改完必校验、推送必回查 | 不知道有没有坏，就等于坏了 |

## 五阶段主流程

前一阶段产出是后一阶段的输入；复查发现问题会回改手册并重跑校验，形成闭环。

| 阶段 | 做什么 | 硬性要求 |
|---|---|---|
| 一 · 实机探查（Probe） | 登录拿态、建立平台地图、只读探查、按钮穷举、写操作闭环 | 漏一个按钮，手册就少一条；每个状态分别扫 |
| 二 · 手册写作（Write） | 定体例、进表不进段、图文紧贴、双版本同源 | 所有标题必须带 `seq="auto"`；不写 URL 路由；不凭推断 |
| 三 · 结构校验（Verify） | `check_doc.py` 机械检查、图号重排、双版交叉比对 | 退出码 1 = 硬错误，修完才能往下走 |
| 四 · 成品复查（Audit） | 提断言清单、自建案例上机、逐条 PASS/FAIL、清残留 | 只做文档内部比对不算复查，必须上机 |
| 五 · 发布（Publish） | parse 预检 → overwrite 推送 → fetch 回查 | 有未处理的 FAIL 不得推送 |

## 增量续写（补模块）

手册几乎不会一次写完。给已有手册加模块时走这条路，只做加法：

```
① 定位插入点（读现有 H1/H2 结构）
② 动笔前确认（落位 / 颗粒度 / 简版顺序）
③ 实机探查新模块（复用已有登录态）
④ 写作（体例对齐已有章节）
⑤ 头部同步（8 处散落信息，最易漏）
⑥ 安全落笔（insert_section.py，命中校验，失配不写盘）
⑦ 校验 → 复查 → 推送
```

三个关键点：落位优先选"接末尾"（图号零重排）；头部 8 处逐项打钩；改动必须走安全脚本，全部命中才写盘。

## 目录结构

```
platform-manual-writer/
├── SKILL.md                      技能主文件：流程、红线、资源索引
├── config_template.json          配置模板（拷贝为 config.json 后填写）
├── setenv.sh / setenv.bat        把 config.json 转成环境变量
├── references/                   9 份方法文档
│   ├── probe-playbook.md         实机探查方法、导航范式、登录态排查
│   ├── button-inventory.md       按钮穷举手册、按钮矩阵表
│   ├── manual-style.md           体例规范、截图与编号规范
│   ├── continuation-guide.md     增量续写七步、头部同步清单
│   ├── conventions.md            文件布局、版本号、命名约定
│   ├── verify-checklist.md       交付前校验清单
│   ├── audit-playbook.md         复查方法、断言分类、覆盖矩阵
│   ├── audit-report-template.md  复查报告模板
│   └── feishu-publish.md         飞书 XML 语法、发布流程、已知坑
├── scripts/
│   ├── login.js                  登录目标平台，产出登录态
│   ├── chrome_path.js            跨平台 Chrome 探测
│   ├── inventory_buttons.js      按钮穷举清点
│   ├── capture_lib.js            截图 + 红框/圆形序号标注
│   ├── check_doc.py              文档结构机械检查
│   ├── renumber.py               图号连续重排
│   ├── insert_section.py         安全批量编辑（命中校验）
│   ├── split_doc.py              大文档分段推送
│   ├── audit_template.js         复查脚本脚手架
│   ├── load_config.py            统一加载配置
│   ├── _emit_env.py              配置转环境变量
│   └── scan_leak.py              残留硬编码安全审计
└── assets/
    ├── manual-skeleton.xml       通用骨架模板
    ├── example-simple-slice.xml  简版范例切片
    └── example-detail-slice.xml  详细版范例切片
```

## 快速开始

```bash
# ① 配置
cp config_template.json config.json   # 填平台名 / URL / 账号 / 路径

# ② 载入环境变量（JS 脚本只读环境变量，这一步不能跳）
. ./setenv.sh          # Windows: setenv.bat

# ③ 确认无旧项目残留
python scripts/scan_leak.py .

# ④ 登录拿态
node scripts/login.js
```

## 依赖

| 依赖 | 用途 |
|---|---|
| Node.js + `playwright-core` | 实机探查与截图 |
| Chrome | Playwright 复用本机已装 Chrome，路径由 `chrome_path.js` 自动探测 |
| `lark-cli` | 飞书文档读写（`docs +create/+update/+fetch`） |
| Python 3 | 文档校验、图号重排、分段推送 |

## 配套技能

| 技能 | 覆盖 | 关系 |
|---|---|---|
| `web-ui-probe` | 实机 UI 探查、按钮穷举、截图标注 | 阶段一 / 四的上游能力，三个脚本同源 |
| `feishu-longdoc-edit` | 飞书长文档安全编辑、分段推送、画板重建 | 阶段五的底层能力，`split_doc.py` 同源 |
