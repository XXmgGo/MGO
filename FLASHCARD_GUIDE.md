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

任何带有 `#flashcards` 标签（默认标签）的笔记都会成为一个牌组。可以把标签写在 frontmatter 里，也可以写在正文中作为内联标签：

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
---card--- ^block-id
Front content here
---
Back content here
---end---
```

### 示例

**简单问答：**
```markdown
---card--- ^fsrs-abc123
What is the capital of France?
---
Paris
```

**带 Markdown 排版：**
```markdown
---card--- ^fsrs-def456
What is the formula for **Einstein's mass-energy equivalence**?
---
$E = mc^2$

Where:
- $E$ = energy
- $m$ = mass
- $c$ = speed of light
```

**带列表：**
```markdown
---card--- ^fsrs-ghi789
Name the three states of matter
---
1. Solid
2. Liquid
3. Gas

*Bonus: Plasma is the fourth state*
```

**多行背面：**
```markdown
---card--- ^fsrs-jkl012
Explain the process of photosynthesis
---
Photosynthesis is the process by which plants convert:

**Light energy** → **Chemical energy**

The basic equation:
$$6CO_2 + 6H_2O + light \rightarrow C_6H_{12}O_6 + 6O_2$$
```

### 卡片分隔符

- 以 `---card---` 开头（不区分大小写）
- 用单独一行 `---` 分隔正面与背面
- 用 `---end---`（或 `---card-end---`）显式结束卡片，从而把后续的标题和正文排除在卡片之外
- `^block-id` 不是必需的，但建议加上，以便卡片拥有稳定的身份标识

---

## 完形填空卡片

完形填空卡片会隐藏句子中的某些词或短语。特别适合：
- 填空式学习
- 在语境中记忆定义
- 语言学习

### 语法

```markdown
==c1::hidden text==
```

- `c1` = 填空编号（支持 c1、c2、c3 等）
- `hidden text` = 复习时需要隐藏的内容

### 示例

**单个填空：**
```markdown
The capital of France is ==c1::Paris==.
```

**多个填空（同一段落）：**
```markdown
==c1::Mitochondria== is the powerhouse of the cell, producing ==c2::ATP== through cellular respiration.
```

**循序渐进学习（c1、c2、c3）：**
```markdown
The three branches of the US government are: ==c1::Legislative==, ==c2::Executive==, and ==c3::Judicial==.
```

**带块 ID 便于编辑：**
```markdown
The quadratic formula is ==c1::x = (-b ± √(b² - 4ac)) / 2a==. ^my-math-card
```

### 完形填空卡片的显示方式

| 原文 | 正面显示 | 背面显示 |
|----------|-------------|------------|
| `The ==c1::capital== of France` | `The [...] of France` | `The capital of France` |

### 重要说明

- 每个填空编号都会生成一张**独立的卡片**
- 同一段落中的 `==c1::text==` 和 `==c2::text==` = 2 张卡片
- 填空必须位于**同一段落**内才会被归为同一组
- 空行会切断段落（从而生成各自独立的卡片）

---

## 卡片 ID 与编辑

### 为什么要用块 ID

块 ID（`^unique-id`）可以保证卡片在编辑之后仍然保留自己的复习记录。

**不使用块 ID：**
- 卡片 ID 由文件路径与正面内容的哈希值生成
- 修改正面内容会让复习记录归零

**使用块 ID：**
- 卡片 ID 基于这个持久化的块 ID
- 可以放心编辑，不会丢失复习记录

### 生成块 ID

使用命令面板：**`Add a new flashcard`**

它会插入一个自带预生成 ID 的模板：
```markdown
---card--- ^fsrs-a1b2c3
Question: 
---
Answer: 
---end---
```

### 手写 ID 的格式

- 以 `fsrs-` 开头（推荐），或使用任意字母数字组合
- 合法 ID 示例：`^fsrs-abc123`、`^my-card-001`、`^chemistry-5`
- 写在正面部分末尾，即 `---card---` 之后

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
---card--- ^fsrs-full-example
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

---

## 单行卡片与反向卡片

单行卡片让你在一行内快速写出原子化的问答对。

### 语法

```markdown
Question::Answer ^block-id
Reversed Question:::Reversed Answer ^block-id
```

- `::` 创建一张标准闪卡（正面出题，背面揭晓答案）。
- `:::` 创建一张反向卡（以背面出题，考查正面）。如果是单词这类需要双向记忆的内容，请写一行 `::` 再加一行 `:::`，并各自使用自己的块 ID。
- 可选的 `^block-id` 能让卡片的历史记录保持稳定。

### 示例

```markdown
What is the speed of sound in air?::Approximately 343 m/s ^snd-001
Neuron Soma:::Cell body containing the nucleus and organelles ^neuro-002
```

---

## 图片遮挡卡片

图片遮挡卡片会把被遮挡的示意图与完整答案图在**原位置**直接互换，不会造成页面纵向跳动。

### 语法

单行语法或块语法，只要正面与背面都是图片嵌入即可：

```markdown
![[diagram-masked.png]]::![[diagram-revealed.png]] ^occlusion-001
```

也可以用块格式：
```markdown
---card--- ^occlusion-002
![[anatomy-masked.svg|500]]
---
![[anatomy-revealed.svg|500]]
```

### 复习交互
- **原位互换**：揭晓答案时，被遮挡的示意图会在完全相同的位置被完整图替换。
- **点击预览**：点击图片，或按 `Space` / `P` / `F`，在提交评级之前于遮挡题图与答案图之间来回切换。
- **自适应缩放**：过长的图片会被限制在视口范围内（桌面端 `70vh`，横屏 `45vh`），移动端会禁用拖动与文本选择。

---

## 输入式主动回忆卡片

输入式卡片要求你先亲手输入答案，然后才能看到正确答案和评级选项。

### 语法

在单行卡片或块卡片上添加 `?type`：

```markdown
?type What is the capital of Canada?::Ottawa ^type-001
```

也可以用块格式：
```markdown
---card--- ?type ^type-002
What is the SI unit of force?
---
Newton
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

MGO 内置了交互式弹窗，你完全不必死记 Markdown 分隔符。

### 1. 引导式卡片创建弹窗
运行命令 `Create card (guided modal)`，或点击 MGO 仪表板上的 **+ New card**：
- 选择目标牌组笔记。
- 通过下拉菜单选择卡片类型。
- 填写问题（Question）与答案（Answer）字段。
- 查看实时的 Markdown 语法预览。
- 按 `Ctrl + Enter`（或 `Cmd + Enter`）插入卡片，自动带上块 ID 并自动打上牌组标签。

### 2. 引导式牌组创建弹窗
点击 MGO 仪表板上的 **+ New deck**，或运行命令 `Create new deck`：
- 输入牌组标题。
- 可选填存放的文件夹路径。
- 自动创建笔记、打上 `#flashcards` 标签并为你打开它。

### 3. 把当前笔记标记为牌组
在任意已有笔记上运行命令 `Tag current note as flashcard deck`，即可立刻把它注册进 MGO。

---

## 快捷命令

| 命令 | 作用 | 快捷键 |
|---------|--------|--------|
| `Create card (guided modal)` | 打开交互式卡片创建器 | - |
| `Create new deck` | 创建已预打牌组标签的笔记 | - |
| `Tag current note as flashcard deck` | 给当前文件加上牌组标签 | - |
| `Add a new flashcard` | 插入基础卡片模板 | - |
| `Add a single-line card` | 插入 `Q::A` 模板 | - |
| `Add a reversed card` | 插入 `Q:::A` 模板 | - |
| `Add a cloze card` | 插入填空模板 | - |
| `Create cloze from selection` | 用 `==c1::...==` 包裹选中文本 | - |
| `Add a type-in card` | 插入输入式块卡片模板 | - |
| `Add a type-in single-line card` | 插入 `Q::A ?type` 模板 | - |
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
Avoid: The ==c1::quick brown fox jumps over the lazy dog==.
Better: The ==c1::quick brown fox== jumps over the lazy dog.

Avoid: ==c1::Paris== is the capital of ==c2::France== and has ==c3::2.1 million== people.
Better: Split into focused clozes or separate cards
```

### 组织方式

```markdown
---
tags: [flashcards, chemistry, organic]
---

# Organic Chemistry - Alkanes #flashcards

## Basic Definitions

---card--- ^chem-001
What is the general formula for alkanes?
---
$C_nH_{2n+2}$

Examples:
- Methane: $CH_4$
- Ethane: $C_2H_6$

---card--- ^chem-002
What type of bonds do alkanes contain?
---
Only **single covalent bonds** (C-C and C-H)

This makes them ==c1::saturated== hydrocarbons. ^chem-003
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
2. 检查语法（尤其是基础卡片的 `---` 分隔符）
3. 打开 **仪表板** → 点击 Refresh（刷新）按钮
4. 查看控制台报错（Ctrl+Shift+I）

### 复习进度被重置了？

- 很可能你编辑了一张没有块 ID 的卡片
- 对于打算后续修改的卡片，请务必使用 `^block-id`

### 填空不生效？

- 确保语法严格是 `==c1::text==`（中间没有空格）
- 检查这些填空是否位于同一段落
- 确认该段落所在的文件已打上 `#flashcards` 标签

---

## 示例牌组

```markdown
---
tags: [flashcards]
---

# Sample Flashcard Deck

## Geography

---card--- ^geo-001
What is the largest ocean on Earth?
---
The **Pacific Ocean**

It covers approximately ==c1::63 million square miles==. ^geo-002

## Programming

---card--- ^code-001
What does the `map()` function do in JavaScript?
---
Creates a new array by applying a function to every element.

```javascript
const doubled = [1, 2, 3].map(x => x * 2);
// Result: [2, 4, 6]
```

## Spaced Repetition Facts

The ==c1::Forgetting Curve== was discovered by ==c2::Hermann Ebbinghaus== in ==c3::1885==. ^sr-001

FSRS stands for ==c1::Free Spaced Repetition Scheduler==. ^sr-002
```

---

## 支持

如果 MGO 帮你学得更快、记得更牢，欢迎：

- **GitHub：** [github.com/XXmgGo/MGO](https://github.com/XXmgGo/MGO)

MGO 基于 [Lemma](https://github.com/Fundaments-Work/Lemma) 二次开发，致谢原作者 Fundaments Work。

---

祝学习愉快！
