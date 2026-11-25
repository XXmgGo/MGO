# MGO - 闪卡制作指南

一份在 Obsidian 中使用 MGO 插件制作闪卡的完整指南。

---

## 目录

1. [开始使用](#开始使用)
2. [基础卡片](#基础卡片)
3. [单行卡片与反向卡片](#单行卡片与反向卡片)
4. [完形填空卡片](#完形填空卡片)
5. [图片遮挡卡片](#图片遮挡卡片)
6. [输入式主动回忆卡片](#输入式主动回忆卡片)
7. [整篇笔记复习](#整篇笔记复习)
8. [引导式卡片与牌组创建](#引导式卡片与牌组创建)
9. [卡片 ID 与编辑](#卡片-id-与编辑)
10. [Markdown 支持](#markdown-支持)
11. [快捷命令](#快捷命令)
12. [最佳实践](#最佳实践)

---

## 开始使用

### 1. 创建牌组

牌组由**标签**决定。任何带有牌组根标签（默认 `#flashcards`，可在设置中配置多个，如 `ja-card`、`en-card`）的笔记都会被识别为牌组的一部分。标签可以写在 frontmatter 里，也可以写在正文中作为内联标签：

**frontmatter 方式：**
```yaml
---
tags: [flashcards]
---
```

**内联方式：**
```markdown
# My Study Notes #flashcards
```

**用 `/` 表示子牌组层级：**
```yaml
---
tags: [ja-card/文法]
---
```

三条关键规则：
- **合并**：多篇笔记打相同标签时，它们的卡片会合并进同一个牌组，一起排期与复习。
- **层级**：`ja-card/文法`、`ja-card/词汇` 会显示在 `ja-card` 下的子牌组；点父牌组的"复习"会连同全部子牌组一起复习。
- **临时规则**：一篇笔记若同时挂了 2 个及以上不同的牌组根标签，该笔记暂时不会被识别为牌组（一般一篇笔记只打一个卡片标签，不受影响）。

### 2. 添加卡片

按照下文介绍的语法把卡片写进牌组。插件会自动识别并建立索引。

### 3. 开始学习

通过以下方式打开 **MGO 仪表板**：
- 右侧状态栏的 **MGO** 按钮
- 命令面板：`Open dashboard`

---

## 基础卡片

基础卡片由**正面**（问题）和**背面**（答案）组成。

### 语法

```markdown
<mgo-card cardId="唯一id">
正面内容
<mgo-a>背面内容</mgo-a>
</mgo-card>
```

- 问题写在 `<mgo-a>` 之前，答案写在 `<mgo-a>…</mgo-a>` 之内。
- 可以整行写完，也可以分行写，两种写法完全等价。
- 阅读视图下这些标签本身不显示，内容像普通段落一样呈现——这正是新语法的设计目标：卡片语法不破坏笔记的阅读体验。

### 示例

**简单问答：**
```markdown
<mgo-card cardId="fsrs-abc123">What is the capital of France?<mgo-a>Paris</mgo-a></mgo-card>
```

**带 Markdown 排版：**
```markdown
<mgo-card cardId="fsrs-def456">
What is the formula for **Einstein's mass-energy equivalence**?
<mgo-a>$E = mc^2$

Where:
- $E$ = energy
- $m$ = mass
- $c$ = speed of light</mgo-a>
</mgo-card>
```

**带列表：**
```markdown
<mgo-card cardId="fsrs-ghi789">
Name the three states of matter
<mgo-a>1. Solid
2. Liquid
3. Gas

*Bonus: Plasma is the fourth state*</mgo-a>
</mgo-card>
```

**多行背面：**
```markdown
<mgo-card cardId="fsrs-jkl012">
Explain the process of photosynthesis
<mgo-a>Photosynthesis is the process by which plants convert:

**Light energy** → **Chemical energy**

The basic equation:
$$6CO_2 + 6H_2O + light \rightarrow C_6H_{12}O_6 + 6O_2$$</mgo-a>
</mgo-card>
```

### 书写规则

- 每张卡片都由 `<mgo-card …>` 开标签与 `</mgo-card>` 闭标签成对包裹（标签名不区分大小写）。
- 答案部分由 `<mgo-a>` 与 `</mgo-a>` 包裹；`</mgo-card>` 显式结束卡片，从而把后续的标题和正文排除在卡片之外。
- 正面或背面为空时该卡片不会被识别；既没有 `<mgo-a>`、也没有挖空的 `<mgo-card>` 同样会被忽略。
- `cardId` 不是必需的，但建议加上，以便卡片拥有稳定的身份标识。

---

## 完形填空卡片

完形填空卡片会隐藏句子中的某些词或短语。特别适合：
- 填空式学习
- 在语境中记忆定义
- 语言学习

### 语法

把挖空写在 `<mgo-card>` 内部：

```markdown
<mgo-card cardId="唯一id">句子中的 ==c1::hidden text== 会被隐藏</mgo-card>
```

- `c1` = 填空编号（支持 c1、c2、c3 等）
- `hidden text` = 复习时需要隐藏的内容
- 填空卡不需要 `<mgo-a>`：只要卡内出现挖空，整段文本就同时作为正面与背面，由挖空决定隐藏位置

### 示例

**单个填空：**
```markdown
<mgo-card cardId="fr-001">The capital of France is ==c1::Paris==.</mgo-card>
```

**多个填空（同一张卡片）：**
```markdown
<mgo-card cardId="cell-001">==c1::Mitochondria== is the powerhouse of the cell, producing ==c2::ATP== through cellular respiration.</mgo-card>
```

**循序渐进学习（c1、c2、c3）：**
```markdown
<mgo-card cardId="gov-001">The three branches of the US government are: ==c1::Legislative==, ==c2::Executive==, and ==c3::Judicial==.</mgo-card>
```

**带 cardId 便于编辑：**
```markdown
<mgo-card cardId="my-math-card">The quadratic formula is ==c1::x = (-b ± √(b² - 4ac)) / 2a==.</mgo-card>
```

分行写也可以：
```markdown
<mgo-card cardId="gov-002">
The three branches of the US government are:
==c1::Legislative==, ==c2::Executive==, and ==c3::Judicial==.
</mgo-card>
```

### 完形填空卡片的显示方式

| 原文 | 正面显示 | 背面显示 |
|----------|-------------|------------|
| `The ==c1::capital== of France` | `The [...] of France` | `The capital of France` |

### 重要说明

- 每个填空编号都会生成一张**独立的卡片**，各自排期
- 同一张卡片里的 `==c1::text==` 和 `==c2::text==` = 2 张卡片
- 填空必须写在同一个 `<mgo-card>…</mgo-card>` 内才会归为同一组；卡片之外的裸 `==c1::text==` 不会被识别为卡片
- 挖空语法本身不破坏阅读体验：高亮写法与 Obsidian 原生的 `==高亮==` 一致，只是带编号时会被识别为填空

---

## 卡片 ID 与编辑

### 为什么要用 cardId

`cardId` 属性（`cardId="unique-id"`）可以保证卡片在编辑之后仍然保留自己的复习记录。

**不写 cardId：**
- 卡片 ID 由文件路径与卡片内容的哈希值生成
- 修改卡片内容会让复习记录归零

**写上 cardId：**
- 卡片 ID 基于这个持久化的标识
- 可以放心编辑，不会丢失复习记录

### 自动生成 cardId

使用命令面板：**`Add a new flashcard`**

它会插入一个自带预生成 cardId 的模板：
```markdown
<mgo-card cardId="fsrs-a1b2c3">
Question: 
<mgo-a>Answer: </mgo-a>
</mgo-card>
```

### 手写 cardId 的格式

- 以 `fsrs-` 开头（推荐），或使用任意字母数字组合
- 合法 ID 示例：`cardId="fsrs-abc123"`、`cardId="my-card-001"`、`cardId="chemistry-5"`
- 写在开标签 `<mgo-card …>` 的属性里
- 同一篇笔记内的 cardId 请保持唯一，避免两张卡片撞到同一个 ID

---

## Markdown 支持

Obsidian 的全部 Markdown 功能都能在卡片中使用：

| 功能 | 示例 |
|---------|---------|
| **加粗/斜体** | `**bold**`, `*italic*` |
| **链接** | `[[Internal Link]]`, `[External](url)` |
| **图片** | `![[image.png]]` |
| **公式（LaTeX）** | `$inline$`, `$$block$$` |
| **代码** | `` `inline` `` 或代码块 |
| **表格** | 标准 Markdown 表格 |
| **列表** | `- bullet`, `1. numbered` |
| **高亮** | `==highlight==`（填空语法除外） |
| **嵌入** | `![[Another Note]]` |
| **标注块（Callout）** | `> [!info]` |

### 完整排版示例

```markdown
<mgo-card cardId="fsrs-full-example">
What is the **Pythagorean theorem**?
<mgo-a>In a right triangle:

$$a^2 + b^2 = c^2$$

Where:
| Variable | Meaning |
|----------|---------|
| $a, b$ | Legs of the triangle |
| $c$ | Hypotenuse |

> [!tip] Remember: The hypotenuse is always the longest side!

See also: [[Geometry Basics]]</mgo-a>
</mgo-card>
```

---

## 单行卡片与反向卡片

单行卡片让你在一行内快速写出原子化的问答对，反向卡片则用来做双向记忆。

### 语法

```markdown
<mgo-card cardId="唯一id">Question<mgo-a>Answer</mgo-a></mgo-card>
<mgo-card cardId="唯一id" reverse>Question<mgo-a>Answer</mgo-a></mgo-card>
```

- 把整张卡写在一行内，就是紧凑的单行写法；分行写效果完全相同，只是可读性更高。
- 在开标签上加 `reverse`，创建一张反向卡（复习时先给答案、回忆问题）。如果是单词这类需要双向记忆的内容，请写一张正向卡再加一张反向卡，并各自使用自己的 cardId。
- 可选的 `cardId` 能让卡片的历史记录保持稳定。

### 示例

```markdown
<mgo-card cardId="snd-001">What is the speed of sound in air?<mgo-a>Approximately 343 m/s</mgo-a></mgo-card>
<mgo-card cardId="neuro-002" reverse>Neuron Soma<mgo-a>Cell body containing the nucleus and organelles</mgo-a></mgo-card>
```

---

## 图片遮挡卡片

图片遮挡卡片会把被遮挡的示意图与完整答案图在**原位置**直接互换，不会造成页面纵向跳动。

### 语法

正反面各写一张图片链接即可自动识别为原地切换：

```markdown
<mgo-card cardId="occlusion-001">![[diagram-masked.png]]<mgo-a>![[diagram-revealed.png]]</mgo-a></mgo-card>
```

分行写也可以，图片还可以带尺寸参数：
```markdown
<mgo-card cardId="occlusion-002">
![[anatomy-masked.svg|500]]
<mgo-a>![[anatomy-revealed.svg|500]]</mgo-a>
</mgo-card>
```

### 复习交互
- **原位互换**：揭晓答案时，被遮挡的示意图会在完全相同的位置被完整图替换。
- **点击预览**：点击图片，或按 `Space` / `P` / `F`，在提交评级之前于遮挡题图与答案图之间来回切换。
- **自适应缩放**：过长的图片会被限制在视口范围内（桌面端 `70vh`，横屏 `45vh`），移动端会禁用拖动与文本选择。

---

## 输入式主动回忆卡片

输入式卡片要求你先亲手输入答案，然后才能看到正确答案和评级选项。

### 语法

在开标签上加 `type="typein"`：

```markdown
<mgo-card cardId="type-001" type="typein">What is the capital of Canada?<mgo-a>Ottawa</mgo-a></mgo-card>
```

分行写法完全相同：
```markdown
<mgo-card cardId="type-002" type="typein">
What is the SI unit of force?
<mgo-a>Newton</mgo-a>
</mgo-card>
```

### 复习体验
复习时会出现一个输入框。按 `Enter` 或点击 `Check` 即可获得即时反馈：
- **正确**（完全匹配）
- **接近**（关键词匹配）
- **错误**
随后会展开完整的评级按钮（`Again`、`Hard`、`Good`、`Easy`），供你诚实地自评。

---

## 整篇笔记复习

不拆分卡片，直接对整篇笔记应用 FSRS 间隔重复。

### 语法

把 `#review` 加在 frontmatter 中，或笔记正文的任意位置：

```yaml
---
tags: [review]
---
# Quantum Mechanics Summary
```

通过命令 `Review due notes` 来复习整篇笔记。

---

## 引导式卡片与牌组创建

MGO 内置了交互式弹窗，你完全不必死记卡片标签语法。

### 1. 引导式卡片创建弹窗
运行命令 `Create card (guided modal)`，或点击 MGO 仪表板上的 **+ New card**：
- 选择目标牌组笔记。
- 通过下拉菜单选择卡片类型。
- 填写问题（Question）与答案（Answer）字段。
- 查看实时的语法预览。
- 按 `Ctrl + Enter`（或 `Cmd + Enter`）插入卡片，自动带上 `cardId` 并自动打上牌组标签。

### 2. 引导式牌组创建弹窗
点击 MGO 仪表板上的 **+ New deck**，或运行命令 `Create new deck`：
- 输入牌组标签路径，例如 `ja-card/文法`（需以某个已配置的根标签开头）。
- 可选填笔记存放的文件夹路径。
- 自动创建笔记、打上该标签并为你打开它。

### 3. 把当前笔记标记为牌组
在任意已有笔记上运行命令 `Tag current note as flashcard deck`，会用第一个根标签把它注册进 MGO。

---

## 快捷命令

| 命令 | 作用 | 快捷键 |
|---------|--------|--------|
| `Create card (guided modal)` | 打开交互式卡片创建器 | - |
| `Create new deck` | 创建已预打牌组标签的笔记 | - |
| `Tag current note as flashcard deck` | 给当前文件加上牌组标签 | - |
| `Add a new flashcard` | 插入 `<mgo-card cardId="id">问题<mgo-a>答案</mgo-a></mgo-card>` 分行模板 | - |
| `Add a single-line card` | 插入紧凑写法 `<mgo-card cardId="id">Q<mgo-a>A</mgo-a></mgo-card>` | - |
| `Add a reversed card` | 插入带 `reverse` 的紧凑模板 | - |
| `Add a cloze card` | 插入带 `==c1::...==` 的卡片模板 | - |
| `Create cloze from selection` | 用 `==c1::...==` 包裹选中文本（不在卡内时自动补上 `<mgo-card>`） | - |
| `Add a type-in card` | 插入带 `type="typein"` 的卡片模板 | - |
| `Add a type-in single-line card` | 插入带 `type="typein"` 的紧凑模板 | - |
| `Open dashboard` | 打开学习仪表板 | - |
| `Review due notes` | 开始整篇笔记复习队列 | - |
| `Sync Now` | 手动同步（需已启用） | - |
| `Check Sync Status` | 查看同步状态 | - |

### 复习会话的快捷键与手势

| 按键 / 手势 | 作用 |
|---------------|--------|
| `Space` / `Enter` | 显示答案 |
| `Space` / `P` / `F` | 在遮挡题图与答案图之间来回预览（图片卡片） |
| `1` | 评级：重来 |
| `2` | 评级：困难 |
| `3` | 评级：良好 |
| `4` | 评级：简单 |
| `Z` | 撤销上一次评级 |
| `Esc` | 退出复习会话 |
| `←` / `→` | 翻页浏览（浏览模式） |
| 向左滑动 | 评级：重来 |
| 向下滑动 | 评级：困难 |
| 向右滑动 | 评级：良好 |
| 向上滑动 | 评级：简单 |

---

## 最佳实践

### 卡片设计

1. **一张卡片只考一个概念** —— 不要往卡片里塞太多信息
2. **问得具体** —— 「2+2 等于几？」优于「列举一些数学常识」
3. **用自己的话写** —— 有助于理解与长期记忆
4. **带上必要语境** —— 简短的语境能更好地唤起记忆

### 填空技巧

```markdown
Avoid: <mgo-card cardId="fox-001">The ==c1::quick brown fox jumps over the lazy dog==.</mgo-card>
Better: <mgo-card cardId="fox-002">The ==c1::quick brown fox== jumps over the lazy dog.</mgo-card>

Avoid: <mgo-card cardId="paris-001">==c1::Paris== is the capital of ==c2::France== and has ==c3::2.1 million== people.</mgo-card>
Better: Split into focused clozes or separate cards
```

### 组织方式

```markdown
---
tags: [flashcards, chemistry, organic]
---

# Organic Chemistry - Alkanes #flashcards

## Basic Definitions

<mgo-card cardId="chem-001">
What is the general formula for alkanes?
<mgo-a>$C_nH_{2n+2}$

Examples:
- Methane: $CH_4$
- Ethane: $C_2H_6$</mgo-a>
</mgo-card>

<mgo-card cardId="chem-002">
What type of bonds do alkanes contain?
<mgo-a>Only **single covalent bonds** (C-C and C-H)</mgo-a>
</mgo-card>

<mgo-card cardId="chem-003">This makes them ==c1::saturated== hydrocarbons.</mgo-card>
```

### 用标签支持自定义学习

在牌组笔记里使用标签，即可启用筛选式学习会话：

```markdown
---
tags: [flashcards, biology, chapter-1, exam-prep]
---
```

然后在 **Custom Study Session**（自定义学习会话）→ Filter by Tags 中使用：`#biology, #exam-prep`

---

## 常见问题排查

### 卡片没有出现？

1. 确认文件已带上 `#flashcards` 标签
2. 检查语法（每张卡片都要有配对的 `<mgo-card …>` 与 `</mgo-card>`，答案要包在 `<mgo-a>…</mgo-a>` 里）
3. 打开 **仪表板** → 点击 Refresh（刷新）按钮
4. 查看控制台报错（Ctrl+Shift+I）

### 复习进度被重置了？

- 很可能你编辑了一张没有 `cardId` 的卡片
- 对于打算后续修改的卡片，请务必写上 `cardId="唯一id"`

### 填空不生效？

- 确保语法严格是 `==c1::text==`（中间没有空格）
- 检查这些填空是否写在同一个 `<mgo-card>…</mgo-card>` 内，写在卡片外面不会被识别
- 确认该卡片所在的文件已打上 `#flashcards` 标签

---

## 示例牌组

```markdown
---
tags: [flashcards]
---

# Sample Flashcard Deck

## Geography

<mgo-card cardId="geo-001">
What is the largest ocean on Earth?
<mgo-a>The **Pacific Ocean**

It covers approximately 63 million square miles.</mgo-a>
</mgo-card>

<mgo-card cardId="geo-002">The Pacific Ocean covers approximately ==c1::63 million square miles==.</mgo-card>

## Programming

<mgo-card cardId="code-001">
What does the `map()` function do in JavaScript?
<mgo-a>Creates a new array by applying a function to every element.

```javascript
const doubled = [1, 2, 3].map(x => x * 2);
// Result: [2, 4, 6]
```</mgo-a>
</mgo-card>

## Spaced Repetition Facts

<mgo-card cardId="sr-001">The ==c1::Forgetting Curve== was discovered by ==c2::Hermann Ebbinghaus== in ==c3::1885==.</mgo-card>

<mgo-card cardId="sr-002">FSRS stands for ==c1::Free Spaced Repetition Scheduler==.</mgo-card>
```

---

## 支持

如果 MGO 帮你学得更快、记得更牢，欢迎：

- **GitHub：** [github.com/XXmgGo/MGO](https://github.com/XXmgGo/MGO)

MGO 基于 [Lemma](https://github.com/Fundaments-Work/Lemma) 二次开发，致谢原作者 Fundaments Work。

---

祝学习愉快！
