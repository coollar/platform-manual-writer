# 交付前校验清单

推送前逐项过一遍。**机械能查的用脚本查，成品真伪靠上机复查，两者都不能少。** 勾完再推。

## 一、机械校验（`scripts/check_doc.py`）

```bash
python scripts/check_doc.py draft.xml --base <资源基目录>
```

脚本会输出以下项，逐项确认：

- [ ] **总字符数** —— 与预期量级相符（简版 ≤ 6 千字量级）
- [ ] **H1 顺序** —— 与文档标题、版本行描述一致
- [ ] **图号序列** —— 1–N **连续、无跳号、无重号**
- [ ] **表格数** —— 与预期相符（改动后应增加/不变）
- [ ] **画板数** —— 与预期相符
- [ ] **图片标签数** —— 与图号数一致
- [ ] **图片/画板资源存在性** —— 引用的文件**全部齐备**（无缺失）
- [ ] **URL 残留** —— 只剩白名单（登录地址、版本互链、外部规范文档），**无路由/查询参数泄漏**
- [ ] **裸尖括号** —— 无未转义的 `<`（应全部为 `&lt;`）

## 二、编号重排

- [ ] 若本次**增删过图**，跑 `scripts/renumber.py` 重排，确保 1–N 连续
- [ ] 有序列表续号：被截断的续接块首项是否带 `seq="N"`（`grep -c 'li seq="'`）
- [ ] 同名小节是否已加限定词（`grep` 重名 H2）

## 三、两版一致性

- [ ] 同一模块的事实，简版与详细版**不矛盾**
- [ ] 一版改动，另一版是否需同步
- [ ] 两版标题顺序与各自正文 H1 顺序一致

## 四、成品实机复查（自建案例 · 覆盖所有情况）

推送前最关键的一关。**只做文档内部比对不算复查，必须上机。**

- [ ] 手册里**每一条可验证断言**都已上机核对（不是只做了文件互比）
- [ ] 用**自建测试案例**（带前缀）验证，而非只读现成数据
- [ ] **所有状态**覆盖（每个状态的按钮差异——最易错处）
- [ ] **按钮逐态扫全**（`scripts/inventory_buttons.js`），与手册的按钮集合**不多不少**对上
- [ ] 分支 / 边界 / 异常覆盖（必填留空、超长、只读字段、前置不满足）
- [ ] 二次确认 / 不可逆类**高危断言已实测**
- [ ] 复查出的偏差已回改手册，且**已分清是「手册错」还是「脚本错」**
- [ ] 自建对象全部清理，**残留扫描为 0**
- [ ] 无法自建的断言已如实标注（**未用推断填补空白**）

详见 `references/audit-playbook.md`；脚本脚手架 `scripts/audit_template.js`。

## 五、内容正确性（脚本查不了，靠眼）

- [ ] **每句话都能在实机找到出处**（无推断）
- [ ] 无 URL / 路由 / 查询参数
- [ ] 界面用词与系统一致（按钮名、Tab 名、状态名）
- [ ] 表格列名与实机表格列逐列一致（曾漏"更新时间"列）
- [ ] 状态枚举与实机下拉一致（如"草稿 / 已发布 / 已归档"三态）
- [ ] **按钮穷举完整** —— 手册某状态的按钮集合 = 实机该状态的按钮集合（**不多不少**，含禁用态）
- [ ] 按钮位置与实机一致（如「创建副本」图标在操作列**最左侧**、三种状态都有）
- [ ] **无文字图标按钮已单独成句**（表格里列不出来，如「创建副本」「…」菜单）
- [ ] 禁用态按钮与其**禁用条件**已写明
- [ ] 必填标记与实机一致（红星号）

## 六、飞书语法预检

- [ ] `lark-cli docs +script --command parse` 的 `warnings` **为空**
- [ ] callout 内用 `<b>` 而非 Markdown
- [ ] 无裸尖括号、无未转义波浪号

## 七、推送与回查

- [ ] 本地 XML 已备份（`xxx_backup.xml`）
- [ ] 推送后 `revision_id` 更新
- [ ] 回查关键新增内容真的落地
- [ ] 图号仍连续

---

## 快速自检命令

```bash
# 结构 + 图号 + 资源 + URL + 转义
python scripts/check_doc.py draft.xml --base <资源基目录> --url-whitelist '白名单正则'

# 图号重排（增删图后）
python scripts/renumber.py draft.xml

# 按钮穷举清点（探查/复查都用；输出 buttons.json + 截图）
MANUAL_BASE_URL="https://<平台>" MANUAL_STATE="./state.json" HOVER_ICONS=1 \
  NODE_PATH="<node-workspace>/node_modules" node scripts/inventory_buttons.js

# 成品实机复查（复用登录态，自建案例）
MANUAL_BASE_URL="https://<平台>" MANUAL_STATE="./state.json" \
  NODE_PATH="<node-workspace>/node_modules" node scripts/audit_template.js

# 飞书语法预检
lark-cli docs +script --command parse --content "@./draft.xml" | grep -E 'status|warnings'

# 重名 H2 检查
python -c "
import re
from collections import defaultdict
s=open('draft.xml',encoding='utf-8').read()
d=defaultdict(list)
for i,l in enumerate(s.split(chr(10)),1):
    m=re.search(r'<h2[^>]*>(.*?)</h2>',l)
    if m: d[m.group(1)].append(i)
dup={k:v for k,v in d.items() if len(v)>1}
print('重名 H2:', dup if dup else '无')
"
```

---

## 硬性通过条件

以下任一不满足，**不得推送**：

1. 图号不连续或有缺失资源
2. parse warnings 非空
3. 出现 URL / 路由泄漏
4. 成品未做**自建案例实机复查**，或复查存在**未处理的 FAIL**
5. 检测到未实机验证的推断内容
6. 存在**未清理的测试残留**
7. 手册某状态的**按钮集合与实机不一致**（含无文字图标未标注、禁用态未写明）
