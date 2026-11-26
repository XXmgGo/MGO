# Writing Cards

Write MGO flashcards as plain Markdown in a tagged note: card blocks, reversed cards, cloze deletions, image occlusion and type-in.

MGO reads cards from any note that carries the deck tag (see [Organizing decks](organizing-decks.md)). Cards are never imported or exported; the text in your note is the card.

## Basic cards

A card is a fenced code block whose language is `mgo`. The front (question) and the back (answer) are separated by a line that contains only `---`:

````markdown
```mgo
What is the function of the ribosome?
---
Protein synthesis via translation of mRNA.
```
````

Rules the parser follows:

- The fence language must be exactly `mgo` (lowercase), with nothing else on the info line.
- The first line inside the block that is exactly `---` (surrounding spaces allowed) splits the block. Everything before it is the front, everything after it is the back.
- Both sides can span any number of lines; line breaks are preserved when rendered.
- Front and back can hold any Markdown: lists, math, code, tables, images, links and callouts. They are rendered with Obsidian's own Markdown renderer.
- A block with no `---` and no cloze marker is not a card. A card with an empty front or empty back is ignored.
- `---` cannot currently be escaped: a literal line of three dashes inside one side would split the card.
- Do not nest another fenced code block inside a card. Use a four-space indented code block instead, otherwise the card ends at the inner fence.

Rendering: the block goes through Obsidian's native code-block processor, so reading view and live preview both show a card (black front, muted back). With the cursor inside the block, Obsidian shows the source, as it does for every code block.

## Reversed cards

Use the `mgo-reverse` fence to study the same card in both directions — during review the back is shown first and you recall the front:

````markdown
```mgo-reverse
Mitochondria
---
Powerhouse of the cell
```
````

If you want two separate cards (one forward, one reversed), write one `mgo` block and one `mgo-reverse` block with the same content.

## Cloze deletions

Wrap the text to hide in `==cN::` and `==`, where `N` is a number, inside an `mgo` block:

````markdown
```mgo
The ==c1::mitochondrion== is the powerhouse of the ==c2::cell==.
```
````

- Every distinct cloze number produces its own card, scheduled independently. The example above gives two cards.
- During review the front shows the target blank as `[...]` while all other clozes in the block display their answers; the back shows the full sentence.
- An optional hint `==c1::answer::hint==` shows `[hint]` on the front instead of `[...]`.
- A cloze block does not use the `---` separator; its whole body is the card text.
- A block that contains cloze markers is treated as a cloze block even if a `---` line is present.
- Write the marker exactly as `==c1::text==`, with no spaces inside `==c1::`.

To create a cloze quickly, select text in the editor and run **Create cloze from selection**, or right-click the selection and choose **Create cloze from selection**. Inside an existing card block the selection is simply wrapped; elsewhere the current line is wrapped into a new `mgo` block. See [Commands and shortcuts](commands-and-shortcuts.md).

## Image occlusion cards

If the front and the back are each a single image embed, MGO treats the card as an in-place image card: the question image is replaced by the answer image in the same position, with no scrolling.

````markdown
```mgo
![[anatomy-masked.png]]
---
![[anatomy-revealed.png]]
```
````

Both sides may use `![[file.ext]]` (optionally with `|size`) or `![alt](path)`. A side counts as an image when its extension is one of png, jpg, jpeg, gif, webp, svg, bmp, avif, tiff or excalidraw; an Excalidraw note (`.excalidraw.md`) counts too. MGO does not draw the masks for you; you prepare the two images yourself. See [Reviewing](reviewing.md#image-cards) for how peeking works.

## Type-in cards

Use the `mgo-typein` fence to make yourself type the answer before the rating buttons appear:

````markdown
```mgo-typein
What is the SI unit of electric current?
---
Ampere
```
````

See [Reviewing](reviewing.md#type-in-cards) for how answers are judged.

## Whole-note review

To review an entire note instead of cards, tag it `#review` in its frontmatter or anywhere in the body.

```markdown
---
tags: [review]
---
Notes on quantum mechanics
```

The note itself is scheduled with FSRS. Start these sessions with the command **Review due notes**. A note can be both a deck and a review note if it has both tags.

## Card IDs and review history

MGO identifies each card so it can keep its schedule.

- A fence card has no ID attribute. Its ID is a hash of the deck note's path plus the card's front and back (cloze cards hash the whole block and append the cloze number).
- Editing a card's content therefore creates a new card with no history. Write the final wording before studying, or export a backup first if you plan a large rewrite.
- Card IDs include the deck note's path. Renaming or moving a deck note inside Obsidian moves each card's history to its new ID. A rename made outside Obsidian is not detected, and those cards start as new. See [Troubleshooting](troubleshooting.md#progress-looks-reset).

## Card attributes

An optional header at the very top of an `mgo` block stores per-card metadata. It uses the same shape as note frontmatter: a line with only `---`, key/value lines, then another `---` line. Attributes are not rendered in the note; only `id` has an immediate effect.

````markdown
```mgo
---
title: Blood pressure
id: fsrs-hp-1
options: [High, Low, Normal]
hint: ありがち means "common, liable to happen"
---
高血圧はお年寄りにありがちな病気だ。
---
High blood pressure is a common illness among the elderly.
```
````

| Attribute | Type | Effect |
|---|---|---|
| `id` | text | Stable card identity; editing the front or back keeps its review history |
| `title` | text | Display name in the dashboard card list under the deck (expand a folder); falls back to the front text |
| `options` | list | Candidate answers reserved for the upcoming multiple-choice mode |
| `hint` | text | Recall hint reserved for a future review option |

Rules:

- The header must be the first thing in the block. Every line between the two `---` lines must be `key: value` or a `- list item`, otherwise the whole block is treated as plain content.
- `options` accepts `[A, B, C]`, `options: A, B, C`, or a multi-line dash list.
- `id` may only contain letters, digits, underscores and hyphens; an invalid id is ignored and the card falls back to its content hash.
- Cloze blocks accept the same header; the attributes apply to every card generated for the block's cloze numbers.
- Unknown keys are preserved but have no effect (reserved for future attributes).

## What you can put in a card

Card sides are rendered by Obsidian, so these work: bold and italic, internal links, images, LaTeX math with `$...$` and `$$...$$`, tables, lists, callouts and embeds. Plain `==highlight==` works as long as it is not in the cloze form `==cN::...==`.

## Card context

While reviewing, MGO shows the heading path above the card, such as `Chapter 2 > Definitions`, taken from the Markdown headings that precede it in the note. This helps when similar questions appear in different sections.

## Inserting cards with commands

The command palette has templates for each format: **Add a new flashcard**, **Add a single-line card**, **Add a reversed card**, **Add a cloze card**, **Add a type-in card** and **Add a type-in single-line card**. Each inserts an `mgo` fenced template and tags the current note as a deck if it is not one already. The full list is in [Commands and shortcuts](commands-and-shortcuts.md).