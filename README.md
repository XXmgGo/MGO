# MGO

> MGO 是基于 [Lemma](https://github.com/Fundaments-Work/Lemma) 的二次开发分支。Lemma 由 Fundaments Work 创作并以 MIT 协议授权，原始版权声明与许可全文保留在 [LICENSE](./LICENSE) 中。

<p align="center">
  <img src="https://raw.githubusercontent.com/XXmgGo/MGO/main/icon.svg" width="96" height="96" alt="MGO logo" />
</p>

<p align="center">
  <strong>一款现代、由 FSRS 驱动的间隔重复插件，就住在你自己的笔记里。</strong><br>
  不需要另一个独立应用。在知识所在的地方直接书写、打标签、复习。卡片始终以普通 Markdown 保存在你的 vault 中；复习记录留在你自己的设备上（或你自己的 CouchDB 上），备份只需一条命令。
</p>

<p align="center">
  <a href="obsidian://show-plugin?id=mgo-flashcards"><img src="https://img.shields.io/badge/install%20in%20obsidian-lemma--flashcards-c6f135?style=for-the-badge&labelColor=141416&logo=obsidian&logoColor=c6f135" alt="Install in Obsidian"></a>
  <a href="https://github.com/XXmgGo/MGO/releases"><img src="https://img.shields.io/github/v/release/Fundaments-Work/Lemma?include_prereleases&label=latest&style=for-the-badge&labelColor=141416&color=c6f135" alt="Latest release"></a>
  <a href="https://github.com/XXmgGo/MGO/releases"><img src="https://img.shields.io/github/downloads/Fundaments-Work/Lemma/total?style=for-the-badge&labelColor=141416&color=c6f135" alt="Downloads"></a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-c6f135?style=flat-square&labelColor=141416" alt="MIT license"></a>
  <a href="https://obsidian.md/plugins?id=mgo-flashcards"><img src="https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=c6f135&color=c6f135&labelColor=141416&label=obsidian%20downloads&query=%24%5B%27mgo-flashcards%27%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=flat-square" alt="Obsidian community downloads"></a>
  <a href="https://github.com/XXmgGo/MGO"><img src="https://img.shields.io/badge/algorithm-FSRS--5-c6f135?style=flat-square&labelColor=141416" alt="Algorithm: FSRS-5"></a>
  <a href="https://github.com/XXmgGo/MGO"><img src="https://img.shields.io/badge/platform-desktop%20%7C%20mobile-c6f135?style=flat-square&labelColor=141416" alt="Platform: Desktop | Mobile"></a>
  <a href="https://github.com/XXmgGo/MGO/actions"><img src="https://img.shields.io/github/actions/workflow/status/Fundaments-Work/Lemma/ci.yml?branch=main&label=ci&style=flat-square&labelColor=141416&color=c6f135" alt="CI status"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-c6f135?style=flat-square&labelColor=141416" alt="Pull requests welcome"></a>
</p>

<p align="center">
  <a href="https://fundaments.work/docs/lemma/">文档</a> ·
  <a href="https://fundaments.work/docs/lemma/guide/flashcards-in-obsidian/">如何在 Obsidian 中制作闪卡</a> ·
  <a href="https://fundaments.work/docs/lemma/guide/compared-with-other-plugins/">与其他插件的对比</a> ·
  <a href="https://fundaments.work/docs/lemma/compare/vs-anki/">MGO vs Anki</a> ·
  <a href="https://github.com/XXmgGo/MGO/issues/new?labels=bug">提交 Bug</a> ·
  <a href="https://github.com/XXmgGo/MGO/issues/new?labels=enhancement">申请新功能</a>
</p>

<p align="center">
  <a href="https://github.com/XXmgGo/MGO/issues/new?labels=bug"><img src="https://img.shields.io/badge/Report%20Issue-ef4444?style=for-the-badge" alt="Report Bug"></a>
  &nbsp;
  <a href="https://github.com/XXmgGo/MGO/issues/new?labels=enhancement"><img src="https://img.shields.io/badge/Request%20Feature-22c55e?style=for-the-badge" alt="Request Feature"></a>
</p>

---

## 效果预览

<p align="center">
  <img src="https://raw.githubusercontent.com/Fundaments-Work/Lemma/main/screenshots/lemma-dashboard.png" width="49%" alt="MGO Dashboard — decks with due counts at a glance">
  <img src="https://raw.githubusercontent.com/Fundaments-Work/Lemma/main/screenshots/lemma-review-modal.png" width="49%" alt="Immersive review mode with FSRS scheduling and LaTeX support">
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/Fundaments-Work/Lemma/main/screenshots/lemma_mobile_dashboard.jpg" width="32%" alt="Mobile dashboard">
  <img src="https://raw.githubusercontent.com/Fundaments-Work/Lemma/main/screenshots/lemma_mobile_review.jpg" width="32%" alt="Mobile review — full screen, native layout">
  <img src="https://raw.githubusercontent.com/Fundaments-Work/Lemma/main/screenshots/lemma_mobile_stats.jpg" width="32%" alt="Mobile statistics panel">
</p>
<p align="center"><em>桌面端与移动端 · LaTeX 公式支持 · 学习数据分析 · 自定义学习会话</em></p>

---

## 为什么选择 MGO？

大多数间隔重复工具都要求你离开知识库、导出笔记，另外维护一套数据库。MGO 把间隔重复直接嵌入 Markdown。

> **标签即牌组。** 给任意笔记加上 `#flashcards`（或你配置的任意牌组标签），用普通 Markdown 写卡片；相同标签的笔记合并成一个牌组，标签里的 `/` 表示子牌组层级，剩下的排期交给 FSRS。

| 特性 | MGO | Anki | 常规间隔重复插件 |
|---|:---:|:---:|:---:|
| 原生 Markdown 工作流 | 是 | 否 | 是 |
| FSRS 排期算法 | 是 | 是（内置） | 部分支持 |
| 移动端支持 | 是 | 是 | 视情况而定 |
| LaTeX / 富 Markdown | 是 | 是 | 视情况而定 |
| 跨设备同步（CouchDB） | 是 | 是 | 视情况而定 |
| 自定义学习会话 | 是 | 是 | 否 |
| 零多余文件 | 是 | 不适用 | 视情况而定 |
| 开源 | 是 | 是 | 是 |

---

## 功能特性

### FSRS 排期
MGO 使用 **FSRS-5**（Free Spaced Repetition Scheduler，通过 `ts-fsrs` 实现），这是一种基于认知科学研究成果的现代排期算法。它会根据你个人的回忆表现，建模记忆稳定性与可提取性。

### 卡片就住在笔记里
直接在任意 Markdown 笔记中编写闪卡，无需导入、无需切换应用。

```markdown
<mgo-card cardId="fsrs-abc123">
What is the powerhouse of the cell?
<mgo-a>**Mitochondria** — produces ATP through cellular respiration.</mgo-a>
</mgo-card>
```

阅读视图下 `<mgo-card>` 与 `<mgo-a>` 标签本身不显示，内容像普通段落一样呈现——卡片语法不会破坏笔记的阅读体验。

### 标签即牌组
牌组由标签决定，而非文件：
- 相同标签的多篇笔记，其卡片**合并成同一个牌组**，一起排期与复习。
- 标签里的 `/` 表示子牌组层级，例如 `#ja-card/文法` 归入 `ja-card` → `文法`；父牌组的复习队列包含其全部子牌组。
- 可配置多个牌组根标签（如 `flashcards`、`ja-card`、`en-card`）。
- 临时规则：一篇笔记若同时挂了 2 个及以上不同的牌组根标签，该笔记暂不识别为牌组。

```markdown
---
tags: [ja-card/文法]
---
```

### 完形填空
```markdown
<mgo-card cardId="cloze-001">The ==c1::mitochondria== is the powerhouse of the ==c2::cell==.</mgo-card>
```
每个填空都会被独立排期。

### 仪表板视图
在一个总览页面中查看所有牌组，卡片总数、到期卡片、新卡数量一目了然。

### 自定义学习会话
可按**标签**、**卡片状态**（新卡、学习中、到期）筛选复习队列，也可设置**卡片上限**，用于针对性学习和备考冲刺。

### 复习统计
通过记忆保持曲线、卡片成熟度分布、复习间隔直方图以及 30 天活动记录来分析学习进度。

### 移动端支持
为桌面端与移动端设计的响应式复习界面，适配安全区并针对触摸操作优化导航。

### 原地图形遮挡
就地复习解剖图与技术示意图，页面不会上下跳动。图片卡片会自动识别成对的图片，在完全相同的视口位置切换遮挡图层，支持点击预览来回切换。

### 输入式主动回忆
直接在复习卡片中输入答案，在显示 FSRS 评级按钮之前先获得“正确 / 接近 / 错误”的判定。

### 引导式卡片与牌组创建
交互式创建弹窗，提供类型下拉选择、实时语法预览和自动牌组打标，让你不必死记卡片语法。

### 撤销、备份与导入
在复习窗口中撤销上一次评级（`Z`）。将所有排期、复习记录和连续打卡数据导出为 JSON 文件，并在另一台设备上合并回来；也可以从其他闪卡应用的纯文本导出文件，或 CSV、TSV 文件中导入卡片。

### 可选的 CouchDB 同步
复习数据存储在每台设备上（IndexedDB）。如需跨设备同步，可自行接入 CouchDB 或 Cloudant 实例。

---

## 快速开始

1. 从社区插件（Community Plugins）安装：搜索 **MGO**。
2. 给任意笔记的 frontmatter 或正文内联标签加上 `#flashcards`：

```yaml
---
tags: [flashcards]
---
```

3. 写一张卡片：

```markdown
<mgo-card cardId="my-first-card">
What is spaced repetition?
<mgo-a>A learning technique that schedules reviews at increasing intervals to maximize long-term retention.</mgo-a>
</mgo-card>
```

4. 从功能区侧边图标、状态栏（桌面端）或命令面板（**Open dashboard**）打开 **MGO 仪表板**。

**完整语法文档：** [FLASHCARD_GUIDE.md](FLASHCARD_GUIDE.md)

---

## 卡片格式

MGO 支持七种卡片与学习格式：

### 1. 基础卡片
完整支持 Markdown、LaTeX 公式块与代码排版。问题写在 `<mgo-a>` 之前，答案写在 `<mgo-a>…</mgo-a>` 之内；`</mgo-card>` 显式关闭卡片，让后续标题或笔记内容留在答案之外。

````markdown
<mgo-card cardId="basic-001">
What is the function of the ribosome?
<mgo-a>Protein synthesis via translation of mRNA.</mgo-a>
</mgo-card>
````

`cardId` 是卡片的稳定身份，编辑内容时靠它保留复习进度；省略时插件会按内容自动哈希出 ID，同样可用，但建议写上。

### 2. 单行紧凑写法
卡片也可以整行写完，与分行写法完全等价，适合在一行内快速写出原子化的问答卡片。

```markdown
<mgo-card cardId="basic-002">What is the capital of Japan?<mgo-a>Tokyo</mgo-a></mgo-card>
```

### 3. 反向卡片
生成一张“给出答案、要求你回忆问题”的卡片，在开标签上加 `reverse`。

```markdown
<mgo-card cardId="rev-001" reverse>Mitochondria<mgo-a>Powerhouse of the cell</mgo-a></mgo-card>
```

### 4. 完形填空卡片
在语境中隐藏一个或多个知识点。多个填空编号（`c1`、`c2`）会生成各自独立的复习项。

```markdown
<mgo-card cardId="cloze-001">The ==c1::Ebbinghaus== forgetting curve shows memory decays without ==c2::spaced repetition==.</mgo-card>
```

### 5. 原地图形遮挡卡片
把被遮挡的示意图与原图就地互换，不产生纵向位移。评级之前点击图片或按 `Space` / `P`，可在遮挡图与答案图之间来回预览。正反面各写一张图片链接即可自动识别：

```markdown
<mgo-card cardId="occlusion-001">![[anatomy-masked.png]]<mgo-a>![[anatomy-revealed.png]]</mgo-a></mgo-card>
```

### 6. 输入式主动回忆卡片
要求你输入答案，并在显示评级按钮之前判定为正确、接近或错误。在开标签上加 `type="typein"`：

```markdown
<mgo-card cardId="typein-001" type="typein">What is the SI unit of electric current?<mgo-a>Ampere</mgo-a></mgo-card>
```

分行写法完全相同：

```markdown
<mgo-card cardId="typein-002" type="typein">
What is the powerhouse of the cell?
<mgo-a>Mitochondria</mgo-a>
</mgo-card>
```

### 7. 整篇笔记复习
在 frontmatter 或正文中加上 `#review`，即可对整篇笔记应用 FSRS 间隔重复。

```markdown
---
tags: [review]
---
# Quantum Mechanics Overview
```

> [!TIP]
> 给每张卡片写上 `cardId="唯一id"`，就能拥有稳定的 ID。

---

## 键盘快捷键与手势

| 快捷键 / 手势 | 作用 |
|---|---|
| `Space` / `Enter` | 显示答案 |
| `Space` / `P` / `F` | 在题目图层与答案图层之间来回预览（图片卡片） |
| `1` | 重来（重置学习步长） |
| `2` | 困难 |
| `3` | 良好 |
| `4` | 简单 |
| `Z` | 撤销上一次评级 |
| `Esc` | 退出本次会话 |
| 向左滑动 | 评级：重来 |
| 向下滑动 | 评级：困难 |
| 向右滑动 | 评级：良好 |
| 向上滑动 | 评级：简单 |

---

## 命令

| 命令 | 说明 |
|---|---|
| `Create card (guided modal)` | 打开引导式创建弹窗，含类型选择器与实时预览 |
| `Create new deck` | 新建一个已预打牌组标签的笔记 |
| `Tag current note as flashcard deck` | 给当前活动笔记加上牌组标签 |
| `Add a new flashcard` | 插入一张带预生成 cardId 的基础卡片模板 |
| `Add a single-line card` | 插入紧凑单行卡片模板 `<mgo-card cardId="id">Q<mgo-a>A</mgo-a></mgo-card>` |
| `Add a reversed card` | 插入带 `reverse` 属性的反向卡片模板 |
| `Add a cloze card` | 插入带 `==c1::…==` 挖空的卡片模板 |
| `Create cloze from selection` | 用填空语法包裹选中的文本（不在卡内时自动补上 `<mgo-card>`） |
| `Add a type-in card` | 插入带 `type="typein"` 的输入式卡片模板 |
| `Add a type-in single-line card` | 插入单行输入式卡片模板 `<mgo-card cardId="id" type="typein">Q<mgo-a>A</mgo-a></mgo-card>` |
| `Open dashboard` | 打开 MGO 牌组总览 |
| `Sync now` | 手动触发一次 CouchDB 同步 |
| `Check sync status` | 查看同步连接状态 |
| `Review due notes` | 开始整篇笔记复习会话 |
| `Import cards from file` | 从纯文本导出文件或 CSV、TSV 文件生成牌组笔记 |
| `Export review data (backup)` | 将排期、复习记录与连续打卡数据保存为 vault 中的 JSON 文件 |
| `Import review data from backup` | 把备份文件，或任意版本的 `data.json`，合并进你的数据 |
| `Reset all card progress` | 重置全部排期数据 |

---

## 设置

| 设置项 | 说明 |
|---|---|
| **牌组标签（Deck tags）** | 用于识别牌组的根标签，可填多个（逗号分隔，默认：`flashcards`）。标签里的 `/` 表示子牌组层级 |
| **每日新卡上限（Max new cards/day）** | 新卡数量上限，按每个牌组分别计算，并统计当天已开始学习的卡片 |
| **每日复习上限（Max reviews/day）** | 每天复习卡片数量的上限 |
| **复习字号（Review font size）** | 复习弹窗中的字体大小 |
| **FSRS 参数（FSRS parameters）** | 算法权重与目标记忆保留率配置 |
| **PouchDB 存储（PouchDB storage）** | 用于数据集合的 IndexedDB 存储引擎 |
| **同步（Sync）** | CouchDB 连接与凭据设置 |

---

## 隐私与网络访问

MGO 采用本地优先（local-first）设计，没有遥测、数据分析、广告或崩溃上报。

### Vault 访问

MGO 只索引 Markdown 笔记（`vault.getMarkdownFiles()`），以便找到带有 `#flashcards` 或
`#review` 标签的笔记。这就是社区插件扫描器报告的 Vault Enumeration（清单枚举）项：索引笔记
需要枚举笔记路径。它不会枚举或读取非 Markdown 文件、附件，以及其他插件的数据。

### 数据存储

设置通过 Obsidian 的插件数据 API 保存（`data.json`）。排期状态与复习历史通过 PouchDB 存储在
IndexedDB 中，对于新安装，数据库按 vault 命名（已有安装仍沿用原先的共享名称，因此不会迁移
任何数据）。PouchDB 会探测 `localStorage` 并写入一个跨标签页变更标记；这就是社区插件扫描器
报告的 Local Storage 项。MGO 从不把 vault 内容、设置或复习数据存进 `localStorage` 或
`sessionStorage`。

### MGO 会读写哪些文件

只有在你主动运行对应命令时，MGO 才会在 vault 中创建文件：**Export review data (backup)** 会在
vault 根目录写入一个 `MGO backup <date and time>.json` 文件，**Import cards from file** 会新建一个
牌组笔记，**Create new deck** 与 **Create card** 会创建或编辑你选定的笔记。导入类命令只读取你在
文件选择器中选中的那一个文件。MGO 不会访问 vault 之外的文件。

### 网络访问

MGO 默认不发起任何网络请求，仅在下列情况下才会连接网络：

| 目标 | 触发时机 | 用途 |
|---|---|---|
| 你的 CouchDB 服务器 | 仅在你启用同步之后 | 在自有设备之间复制复习数据 |
| `github.com` | 仅当你点击仓库、许可证或 issue 链接 | 在浏览器中打开对应页面 |

同步需要手动开启。CouchDB 密码保存在插件数据文件（`data.json`）中，以便重启后能够重新连接；
Obsidian 不会对该文件做静态加密。请为同步使用一个只能访问该同步数据库的专用 CouchDB 用户，
并使用 `https://` 地址。使用 `http://` 地址会以明文传输凭据和复习数据。

---

## 安装

### 社区插件市场
1. 打开 **设置 → 社区插件**
2. 点击 **浏览**，搜索 **MGO**
3. 选择 **安装**，然后 **启用**

### 手动安装
1. 从 [最新版本](https://github.com/XXmgGo/MGO/releases/latest) 下载 `main.js`、`manifest.json` 和 `styles.css`
2. 把这些文件复制到：
   ```
   <vault>/.obsidian/plugins/mgo-flashcards/
   ```
3. 重新加载 Obsidian，并在 **设置 → 社区插件** 中启用该插件

发布产物只包含 `main.js`、`manifest.json` 和 `styles.css`。如果你希望在安装副本旁边保留许可条款，
`LICENSE` 与 `THIRD_PARTY_NOTICES.md` 仍然保留在仓库中。

---

## 支持

如果 MGO 对你的学习和日常知识留存有帮助，欢迎：

- 在 [GitHub](https://github.com/XXmgGo/MGO) 上给仓库点个 Star

---

## 参与贡献

欢迎提交代码贡献、Bug 报告与功能建议。

- **Issue 跟踪：** [GitHub issues](https://github.com/XXmgGo/MGO/issues)
- **Pull Request：** 向 `main` 分支发起 PR

---

## 许可证

MGO 基于 **MIT License** 发布。

Copyright (c) 2025-2026 Fundaments Work

宽松的许可条款允许使用、复制、修改、合并、出版发行、再许可与销售，前提是保留版权声明与许可
声明。本项目不提供任何担保。

> **许可历史：** 截至 **v1.1.3**（含该版本）的发布版采用 ISC License（亦称 OBSD）。从 **v1.1.4**
> 起，MGO 改用 MIT。两者同为宽松许可，实质效力基本一致；任何版本的用户都可以根据自己所获得
> 的那个发布版的条款来使用、修改和再分发。

- **许可全文：** [LICENSE](LICENSE)
- **随附依赖：** [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

贡献内容适用相同条款，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。
