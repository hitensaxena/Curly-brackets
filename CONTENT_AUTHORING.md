# Content Authoring

All website content is authored through `MDX + frontmatter` in `content/<category>/`.

## Shared Frontmatter

Every entry supports:

```yaml
title: string
description: string
date: YYYY-MM-DD
tags:
  - optional
thumbnail: /path/to/image
draft: false
```

## Category-Specific Frontmatter

### `journal`

Use the shared fields only. The MDX body is the entry content.

### `ui-ux-design`

```yaml
summary: string
role: string
timeline: string
tools:
  - Figma
  - Research
```

### `digital-art`

```yaml
gallery:
  - src: /art/example.svg
    alt: Description of the image
    caption: Optional caption
```

### `music`

```yaml
audioSrc: https://example.com/file.mp3
duration: 2:21
```

### `web-experiences`

```yaml
href: /experiences/example.html
embedUrl: /experiences/example.html
```

## Add a New Entry

1. Create an `.mdx` file in the correct category folder.
2. Add frontmatter that matches the category schema.
3. Update the category `_meta.js` so the entry appears in the content map.
4. Add referenced assets under `public/` when needed.
