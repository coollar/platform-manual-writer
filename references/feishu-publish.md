# 飞书文档发布手册

手册交付到飞书云文档，用 `lark-cli` 的 XML 工作流。本文件给出语法、发布流程与已知坑。

> 若目标平台不使用飞书文档，参考本文的"发布三步"思路（预检 → 推送 → 回查）在你的目标工具上等价实现即可。

## 目录

- [一、发布三步流程](#一发布三步流程)
- [二、XML 语法要点](#二xml-语法要点)
- [三、图片与画板](#三图片与画板)
- [四、已知坑清单](#四已知坑清单)
- [五、常用命令速查](#五常用命令速查)

---

## 一、发布三步流程

**三步不可省**——跳过任何一步都可能出问题且不自知。

```bash
# ① 语法预检（务必看 warnings 是否为空）
lark-cli docs +script --command parse --content "@./draft.xml"

# ② 推送（overwrite 全量覆盖）
lark-cli docs +update --doc <token> --command overwrite --content "@./draft.xml"

# ③ 回查（确认 revision 更新 + 关键内容落地）
lark-cli docs +fetch --doc <token>
```

**每步的坑**：

1. **parse 不能省** —— 服务端会对不支持的语法**静默降级**（如把 `<ol seq>` 的属性丢掉）。不看 warnings，就不会发现。
2. **推送前备份** —— 先 `cp draft.xml draft_vN_backup.xml`，出问题可回滚。
3. **回查要具体** —— 不只确认 revision 变了，还要 grep 关键新增内容是否真的落地（图表号、新增小节名等）。
4. **大文档要分段推** —— 顶层块过多时（实测详细版 **457 顶层块 / 104 图 / 36 表**），全量 `overwrite` 会**服务端超时**（`error.type=network, subtype=timeout`，"server time out error"——是**服务端**超时，调客户端超时无用），重试 7 次全败；更糟的是服务端可能已**部分写入**，导致内容错位（实测线上开头多出一段本应在末尾的正文）。对策见 [四、已知坑清单](#四已知坑清单) 的"大文档全量推送超时"。

---

## 二、XML 语法要点

### 标题

```xml
<h1 seq="auto">模块名</h1>
<h2 seq="auto">小节名</h2>
<h3 seq="auto">子小节</h3>
```

`seq="auto"` 让飞书自动编号。

### 有序列表续号

```xml
<li seq="3">接着 3 号</li>   <!-- seq 写在 li 上；写在 ol 上无效 -->
```

### callout（提示块）

```xml
<callout>
  <p><b>注意：</b>callout 内不能用 Markdown 加粗，要用 <b>。</p>
</callout>
```

### 转义

- **裸尖括号必须转义**：`<触发器标识>` → `&lt;触发器标识&gt;`，否则破坏 XML 结构。
- **波浪号 `~` 会被飞书转义成 `\~`** → 改用 en dash `–`。
- **`>>` 之类**用 `&gt;&gt;`。

### 表格

```xml
<table>
<thead><tr><th><p>表头1</p></th><th><p>表头2</p></th></tr></thead>
<tbody>
<tr><td><p>内容</p></td><td><p>内容</p></td></tr>
</tbody>
</table>
```

单元格内可放 `<p>`、`<b>`、`<ol>` 等。

---

## 三、图片与画板

### 图片

```xml
<img path="@./<work_dir>/xxx.png" caption="图 1  说明文字"/>
```

- `path` 用 `@` 前缀，相对 **CLI 的 cwd**。
- 扩展名必须与实际文件一致。
- `resource_preflight_failed` 基本是路径写错（如误写成 `@/...`）。

### 原生画板（可编辑）

```xml
<whiteboard type="svg" path="@./x.svg"/>
```

会用 SVG 生成**原生可编辑画板**，比贴图片更好（读者可编辑）。

- 导出预览：`whiteboard +export --output-type preview` 返回 **.jpg**，输出扩展名必须写 `.jpg`（写成 .png 会出错）。

#### ⚠️ `fetch` → `overwrite` 不是无损往返（白板会丢）

`docs +fetch` 读回线上文档时，白板被渲染成**空标签 + token 引用**：

```xml
<whiteboard token="<旧token>"></whiteboard>
```

把这种 XML 直接 overwrite 推回去，服务端会尝试 clone 该 token 的画板——**经常失败**：返回 `result: partial_success` 与警告 `degrade_code=2105,msg=Whiteboard clone failed. Retry later`，**线上画板直接消失**（fetch 回查里 `whiteboard` 计数变成 0，读者看到的位置空白）。

**正确做法**：用 fetch 结果做基准做二次编辑时，先把白板块**还原成生成式写法**再推：

```xml
<whiteboard type="svg" path="@./x.svg"></whiteboard>
```

成功后 `data.document.new_blocks` 会返回 `{"block_type": "whiteboard", "block_token": "..."}`，说明画板已重建。**结论：不要把 fetch 结果当作可长期回滚的中间态；本地 svg 源文件要一直留着。**

> `path="@./..."` 相对 **CLI 的 cwd**，不是相对 XML 文件位置。若基准文件在 `outputs/simple/`、svg 在 `outputs/simple/x.svg`，旧写法 `@./simple/x.svg` 说明当时 `cd outputs/` 执行——从别处执行就要改成对应的相对路径。

---

## 四、已知坑清单

| 坑 | 现象 | 处置 |
|---|---|---|
| callout 内加粗 | Markdown `**` 不生效 | 用 `<b>` |
| 波浪号 | `~` 被转义 | 换 en dash `–` |
| `ol seq` | 属性被静默丢弃 | `seq` 写 `<li>` 上 |
| 画板导出扩展名 | 返回 .jpg 却写 .png | 输出写 `.jpg` |
| `--title` 重复 | 标题出现两次 | 用 `--title` 时正文不再写 `<title>` |
| 图片路径 | `resource_preflight_failed` | 检查 `@./` 前缀与扩展名 |
| 同名小节 | 飞书大纲跳转分不清 | 加限定词（如"模块说明 · 设备管理"） |
| 裸尖括号 | XML 结构破损 | `&lt;` `&gt;` 转义 |
| 白板往返丢失 | fetch 回来的 `<whiteboard token>` 直接 push → clone 失败、线上画板消失（`degrade_code=2105`） | 还原为 `<whiteboard type="svg" path="@./x.svg">` 再推；成功后查 `new_blocks` 是否有 `block_type=whiteboard` |
| 大文档全量推送超时 | 顶层块多（实测 457 块 / 104 图）时连续 `network/timeout`，服务端还可能**部分写入**致内容错位 | **分段推**：按顶层块切段（每段 ~120 块），首段 `overwrite`、其余 `append`；切段脚本断言「各段重组 == 源文件」 |

---

## 五、常用命令速查

```bash
# 创建文档（首次）
lark-cli docs +create --doc-format xml --content "@./draft.xml"

# 语法校验
lark-cli docs +script --command parse --content "@./draft.xml"

# 全量覆盖更新
lark-cli docs +update --doc <token> --command overwrite --content "@./draft.xml"

# 读回文档
lark-cli docs +fetch --doc <token>

# 删除文档（清理测试文档）
lark-cli drive +delete --file-token <token> --type docx --yes

# 白板预览导出
lark-cli whiteboard +export --output-type preview ...

# 大文档分段推送（首段 overwrite，其余 append；每段 ~120 顶层块）
lark-cli docs +update --doc <token> --command overwrite --content "@./seg_01.xml"
for f in seg_02.xml seg_03.xml seg_04.xml; do
  lark-cli docs +update --doc <token> --command append --content "@./$f"
done
```

**删除确认**：`drive +delete` 需带 `--yes`。批量清理测试文档时逐个删。

---

## 交付检查（推送后）

推送成功后**必须回查**，确认：

- [ ] revision_id 已更新
- [ ] `warnings` 为空（出现 `Whiteboard clone failed` 必须重推）
- [ ] 关键新增内容可 grep 到（新小节名、图号、表格）
- [ ] 画板（若有）已上传为原生画板 —— 回查里 `whiteboard` 计数与预期一致（**不能为 0**）
- [ ] 图号连续（1–N）
- [ ] 大文档分段推后，回查的**纯文本与本地基准逐字一致**（去标签去空白后比对，可查出静默的错位/丢失）

回查命令示例：

```bash
lark-cli docs +fetch --doc <token> > /tmp/fetch.json
python -c "import json,re; c=json.load(open('/tmp/fetch.json',encoding='utf-8'))['data']['document']['content']; print('版本:', bool(re.search(r'V1\.13', c)))"
```
