# MGO - 闪卡制作指南

一份在 Obsidian 中使用 MGO 插件制作闪卡的完整指南。

---

## 目录

1. [开始使用](#开始使用)
2. [基础卡片](#基础卡片)
3. [反向卡片与输入作答卡](#反向卡片与输入作答卡)
4. [完形填空卡片](#完形填空卡片)
5. [图片遮挡卡片](#图片遮挡卡片)
6. [输入式主动回忆卡片](#输入式主动回忆卡片)
7. [整篇笔记复习](#整篇笔记复习)
8. [引导式卡片与牌组创建](#引导式卡片与牌组创建)
9. [卡片身份与编辑](#卡片身份与编辑)
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

卡片写在一个 `mgo` 代码块里，块内用**单独一行 `---`** 分隔正面与背面：

````markdown
```mgo
正面内容（问题，可以多行）
---
背面内容（答案，可以多行）
```
````

- 代码块由 Obsidian 原生渲染，阅读视图和实时预览里都能正常显示，不需要任何 HTML 标签。
- 正面、背面都可以写多行、列表、公式、图片链接；换行会原样保留。
- 同一篇笔记里可以写多个 `mgo` 代码块，每块是一张卡片。

### 卡片类型

| 写法 | 类型 |
|---|---|
| ` ```mgo ` | 基础卡（正面 → 背面） |
| ` ```mgo-reverse ` | 反向卡（背面 ↔ 正面，双向回忆） |
| ` ```mgo-typein ` | 输入作答卡（手动键入答案） |

### 示例

**简单问答：**
````markdown
```mgo
What is the capital of France?
---
Paris
```
````

**带 Markdown 排版：**
````markdown
```mgo
What is the formula for **Einstein's mass-energy equivalence**?
---
$E = mc^2$

Where:
- $E$ = energy
- $m$ = mass
- $c$ = speed of light
```
````

**多行背面：**
````markdown
```mgo
Explain the process of photosynthesis
---
Photosynthesis is the process by which plants convert:

**Light energy** → **Chemical energy**

The basic equation:
$$6CO_2 + 6H_2O + light \rightarrow C_6H_{12}O_6 + 6O_2$$
```
````

### 书写规则

- 代码块的语言名必须是 `mgo`、`mgo-reverse` 或 `mgo-typein`（小写），后面不要再跟别的文字。
- 正/背面之间用**单独一行 `---`** 分隔；没有 `---` 且不含挖空标记的块不会被识别为卡片。
- 正面或背面为空时该卡片会被忽略。
- 卡片的身份由「笔记路径 + 正面 + 背面」的内容指纹决定，修改卡片内容会生成新卡（复习进度从零开始）。
- 块内不要再套 ` ``` ` 代码围栏（会提前截断卡片）；需要展示代码时用 4 空格缩进代码块。
- 笔记里的卡片按普通段落显示，右上角有一个浅色的 `MGO` 标记：点一下会把光标放进这张卡的代码块，直接编辑源码（阅读视图下会自动切到源码模式）。
- 目前没有转义 `---` 的写法：正面内容里出现「单独一行三个减号」会被当作分隔线。

### 卡片属性（可选）

属性写在卡片块最顶部，用一对 `---` 包住，写法与笔记 frontmatter 相同。属性只作元数据，键名和值不会显示在卡片正文里；唯一会在界面出现的是 `audio`（右下角小喇叭）。

````markdown
```mgo
---
title: 高血压
id: fsrs-hp-1
options: [高い, 低い, 普通]
hint: 注意「ありがち」是「常见、常有」的意思
---
高血圧はお年寄りにありがちな病気だ。
---
高血压是老年人常见的疾病。
```
````

| 属性 | 类型 | 作用 |
|---|---|---|
| `title` | 文本 | 卡片显示名：在仪表盘展开文件夹后直接列在牌组下方（没写时显示正面文字） |
| `id` | 文本 | 稳定的卡片身份；写了它，修改正/背面内容也不会丢失复习进度 |
| `options` | 列表 | 选择题候选项，预留给后续选择题功能 |
| `hint` | 文本 | 回忆提示，预留给后续复习界面 |
| `audio` | 文本 | 语音地址：笔记卡片右下角、复习界面卡片右上角出现小喇叭，点击播放 / 停止（复习时也可按 `A`） |

规则：

- 属性段必须位于块的最开头：第一行是 `---`，再找下一条 `---` 结束；段内每一行都必须是「键: 值」或「- 列表项」，否则整段按正文处理。
- `options` 支持三种写法：`[A, B, C]`、`options: A, B, C`、多行 `- A` / `- B`。
- `id` 只能用字母、数字、下划线、连字符；不合法的 id 会被忽略，卡片退回内容指纹。
- 挖空卡同样支持属性段，属性会应用到每个挖空编号生成的卡片上。
- 未知的键会被保留但不影响行为（留给后续版本）。

---

## 完形填空卡片

完形填空卡片会隐藏句子中的某些词或短语。特别适合：
- 填空式学习
- 在语境中记忆定义
- 语言学习

### 语法

把挖空写在 `mgo` 代码块内部：

````markdown
```mgo
句子中的 ==c1::hidden text== 会被隐藏
```
````

- `c1` = 填空编号（支持 c1、c2、c3 等）
- `hidden text` = 复习时需要隐藏的内容
- 填空卡不需要 `---` 分隔：只要块内出现挖空，整段文本就同时作为正面与背面，由挖空决定隐藏位置

### 示例

**单个填空：**
````markdown
```mgo
The capital of France is ==c1::Paris==.
```
````

**多个填空（同一张卡片）：**
````markdown
```mgo
==c1::Mitochondria== is the powerhouse of the cell, producing ==c2::ATP== through cellular respiration.
```
````

**循序渐进学习（c1、c2、c3）：**
````markdown
```mgo
The three branches of the US government are: ==c1::Legislative==, ==c2::Executive==, and ==c3::Judicial==.
```
````

分行写也可以：
````markdown
```mgo
The three branches of the US government are:
==c1::Legislative==, ==c2::Executive==, and ==c3::Judicial==.
```
````

### 完形填空卡片的显示方式

| 原文 | 正面显示 | 背面显示 |
|----------|-------------|------------|
| `The ==c1::capital== of France` | `The [...] of France` | `The capital of France` |

### 重要说明

- 每个填空编号都会生成一张**独立的卡片**，各自排期
- 同一个代码块里的 `==c1::text==` 和 `==c2::text==` ⇒ 2 张卡片
- 填空必须写在同一个 `mgo` 代码块内才会归为同一组；卡片之外的裸 `==c1::text==` 不会被识别为卡片
- 挖空语法本身不破坏阅读体验：高亮写法与 Obsidian 原生的 `==高亮==` 一致，只是带编号时会被识别为填空

---

## 卡片身份与编辑

### 卡片 ID 怎么来

代码块写法没有可写的 `cardId` 属性，卡片 ID 由「笔记路径 + 正面 + 背面」的内容指纹生成：

- 修改卡片内容会生成一张新卡，复习记录从零开始
- 需要大改时可以先导出备份（设置 → 数据）

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

````markdown
```mgo
What is the **Pythagorean theorem**?
---
In a right triangle:

$$a^2 + b^2 = c^2$$

Where:
| Variable | Meaning |
|----------|---------|
| $a, b$ | Legs of the triangle |
| $c$ | Hypotenuse |

> [!tip] Remember: The hypotenuse is always the longest side!

See also: [[Geometry Basics]]
```
````

---

## 反向卡片与输入作答卡

反向卡用来做双向记忆，输入作答卡让你手动键入答案。

### 语法

````markdown
```mgo-reverse
Question
---
Answer
```
````

````markdown
```mgo-typein
Question
---
Answer
```
````

- `mgo-reverse`：复习时先给背面、回忆正面（双向记忆）；单词这类内容可以写一张 `mgo` 正向卡再加一张 `mgo-reverse`。
- `mgo-typein`：复习时显示正面，要求手动输入答案后对照。
- 卡片的身份由内容指纹决定，修改内容会重新从零开始排期。

### 示例

````markdown
```mgo-reverse
Neuron Soma
---
Cell body containing the nucleus and organelles
```
````

---

## 图片遮挡卡片

图片遮挡卡片会把被遮挡的示意图与完整答案图在**原位置**直接互换，不会造成页面纵向跳动。

### 语法

正反面各写一张图片链接即可自动识别为原地切换：

````markdown
```mgo
![[diagram-masked.png]]
---
![[diagram-revealed.png]]
```
````

图片还可以带尺寸参数：

````markdown
```mgo
![[anatomy-masked.svg|500]]
---
![[anatomy-revealed.svg|500]]
```
````

### 复习交互
- **原位互换**：揭晓答案时，被遮挡的示意图会在完全相同的位置被完整图替换。
- **点击预览**：点击图片，或按 `Space` / `P` / `F`，在提交评级之前于遮挡题图与答案图之间来回切换。
- **自适应缩放**：过长的图片会被限制在视口范围内（桌面端 `70vh`，横屏 `45vh`），移动端会禁用拖动与文本选择。

---

## 输入式主动回忆卡片

输入式卡片要求你先亲手输入答案，然后才能看到正确答案和评级选项。

### 语法

使用 `mgo-typein` 代码块：

````markdown
```mgo-typein
What is the capital of Canada?
---
Ottawa
```
````

````markdown
```mgo-typein
What is the SI unit of force?
---
Newton
```
````

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

MGO 内置了交互式弹窗，你完全不必死记卡片语法。

### 1. 引导式卡片创建弹窗
运行命令 `Create card (guided modal)`，或点击 MGO 仪表板上的 **+ New card**：
- 选择目标牌组笔记。
- 通过下拉菜单选择卡片类型。
- 填写问题（Question）与答案（Answer）字段。
- 查看实时的语法预览。
- 按 `Ctrl + Enter`（或 `Cmd + Enter`）插入卡片，自动生成 `mgo` 代码块并自动打上牌组标签。

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
| `Add a new flashcard` | 插入 `mgo` 代码块基础卡片模板 | - |
| `Add a single-line card` | 插入紧凑版 `mgo` 卡片模板（问题、答案各一行） | - |
| `Add a reversed card` | 插入 `mgo-reverse` 反向卡片模板 | - |
| `Add a cloze card` | 插入带 `==c1::...==` 的卡片模板 | - |
| `Create cloze from selection` | 用 `==c1::...==` 包裹选中文本（不在卡内时自动补上 `mgo` 代码块） | - |
| `Add a type-in card` | 插入 `mgo-typein` 输入式卡片模板 | - |
| `Add a type-in single-line card` | 插入紧凑版 `mgo-typein` 卡片模板 | - |
| `Open dashboard` | 打开学习仪表板 | - |
| `Review due notes` | 开始整篇笔记复习队列 | - |
| `Sync Now` | 手动同步（需已启用） | - |
| `Check Sync Status` | 查看同步状态 | - |

### 复习会话的快捷键与手势

复习在独立的 Obsidian 标签页里进行。顶栏的「打开原文笔记」图标（或 `E` 键）会在另一个标签页打开当前卡片的原文并滚动到卡片块；光标停在卡片块上方一行，卡片仍按渲染状态显示，不会展开成 ```` ```mgo ```` 源码（要改源码就点卡片右上角的 `MGO` 标记）。复习标签页保持打开。

| 按键 / 手势 | 作用 |
|---------------|--------|
| `Space` / `Enter` | 显示答案 |
| `Space` / `P` / `F` | 在遮挡题图与答案图之间来回预览（图片卡片） |
| `1` | 评级：重来 |
| `2` | 评级：困难 |
| `3` | 评级：良好 |
| `4` | 评级：简单 |
| `Z` | 撤销上一次评级 |
| `A` | 播放 / 停止当前卡片的语音（卡片写了 `audio:` 属性时） |
| `Esc` | 结束复习（关闭复习标签页） |
| `R` | 刷新当前卡片（重新读取原文，更新修改后的内容） |
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

````markdown
```mgo
The ==c1::quick brown fox jumps over the lazy dog==.
```
````

````markdown
```mgo
The ==c1::quick brown fox== jumps over the lazy dog.
```
````

一个块里塞太多编号会降低回忆质量（例如 `==c1::Paris== is the capital of ==c2::France== and has ==c3::2.1 million== people.`），建议拆成聚焦的卡片。

### 组织方式

````markdown
---
tags: [flashcards, chemistry, organic]
---

# Organic Chemistry - Alkanes #flashcards

## Basic Definitions

```mgo
What is the general formula for alkanes?
---
$C_nH_{2n+2}$

Examples:
- Methane: $CH_4$
- Ethane: $C_2H_6$
```

```mgo
What type of bonds do alkanes contain?
---
Only **single covalent bonds** (C-C and C-H)
```

```mgo
This makes them ==c1::saturated== hydrocarbons.
```
````

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
2. 检查语法：代码块语言名必须是 `mgo`（或 `mgo-reverse`、`mgo-typein`），正面与背面之间要有**单独一行 `---`**，且两侧都不为空
3. 打开 **仪表板** → 点击 Refresh（刷新）按钮
4. 查看控制台报错（Ctrl+Shift+I）

### 复习进度被重置了？

- 卡片没有可写的 ID 属性，ID 由内容指纹生成
- 编辑卡片内容会生成新卡，复习进度从零开始；需要保留进度时请尽量一次写好，或先导出备份

### 填空不生效？

- 确保语法严格是 `==c1::text==`（中间没有空格）
- 检查这些填空是否写在同一个 `mgo` 代码块内，写在块外面不会被识别
- 挖空块不要用 `---` 分隔正反面
- 确认该卡片所在的文件已打上 `#flashcards` 标签

---

## 示例牌组

````markdown
---
tags: [flashcards]
---

# Sample Flashcard Deck

## Geography

```mgo
What is the largest ocean on Earth?
---
The **Pacific Ocean**

It covers approximately 63 million square miles.
```

```mgo
The Pacific Ocean covers approximately ==c1::63 million square miles==.
```

## Programming

```mgo
What does the `map()` function do in JavaScript?
---
Creates a new array by applying a function to every element.

    const doubled = [1, 2, 3].map(x => x * 2);
    // Result: [2, 4, 6]
```

## Spaced Repetition Facts

```mgo
The ==c1::Forgetting Curve== was discovered by ==c2::Hermann Ebbinghaus== in ==c3::1885==.
```

```mgo
FSRS stands for ==c1::Free Spaced Repetition Scheduler==.
```
````

---

## 支持

如果 MGO 帮你学得更快、记得更牢，欢迎：

- **GitHub：** [github.com/XXmgGo/MGO](https://github.com/XXmgGo/MGO)

MGO 基于 [Lemma](https://github.com/Fundaments-Work/Lemma) 二次开发，致谢原作者 Fundaments Work。

---

祝学习愉快！
