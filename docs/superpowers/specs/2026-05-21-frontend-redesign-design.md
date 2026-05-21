# AgentRAG Frontend Redesign — Warm Refined

**Date**: 2026-05-21
**Status**: Approved
**Direction**: Anthropic-inspired warm cream + orange accent + clean minimalism

## Design Goals

Transform the shadcn/ui default neutral-gray theme into a warm, refined visual identity inspired by Anthropic's website — light cream backgrounds, warm orange accents, clean typography, paper-like card textures.

## Color System

### Light Theme (Default)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#faf8f5` | Full page background |
| `--foreground` | `#3d3530` | Primary text |
| `--card` | `#ffffff` | Card, answer bubble backgrounds |
| `--card-secondary` | `#fefcf9` | Tool call, reasoning, source card backgrounds |
| `--card-foreground` | `#5c4a3a` | Card text |
| `--primary` | `linear-gradient(135deg, #e8954c, #d4704a)` | Primary buttons, message bubbles, accent elements |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` | `#f5f1ec` | Sidebar, secondary panels |
| `--secondary-foreground` | `#3d3530` | Text on secondary |
| `--muted` | `#f5f1ec` | Muted backgrounds |
| `--muted-foreground` | `#9e8b78` | Secondary text, labels |
| `--accent` | `#fefaf5` | Active states, highlighted items |
| `--accent-foreground` | `#8b5e3c` | Active text |
| `--border` | `#e8e0d5` | Standard borders |
| `--border-light` | `#f0e0c8` | Subtle card borders |
| `--border-dashed` | `#e8d5b8` | Dashed borders (reasoning panels) |
| `--ring` | `rgba(232, 149, 76, 0.4)` | Focus rings |
| `--destructive` | `#dc5a5a` | Error states |
| `--destructive-foreground` | `#ffffff` | Text on destructive |

### Accent Palette

- **Primary orange**: `#e8954c` → `#d4704a` (warm orange gradient)
- **Hover orange**: `#d4784a`
- **Light orange bg**: `#fefaf5`
- **Orange border**: `#f0d8b8`

### Text Hierarchy

- **Primary text**: `#3d3530` (dark brown-black)
- **Body text**: `#5c4a3a` (medium brown)
- **Secondary text**: `#9e8b78` (warm gray-brown)
- **Muted text**: `#b8a48e` (light warm gray)
- **Disabled text**: `#c4b49a` (very light warm)

### Status Colors

- **Success**: `#6b9c5a` (sage green)
- **Warning**: `#d4904e` (warm amber)
- **Error**: `#dc5a5a` (soft red)
- **Info**: `#8b5e3c` (warm brown)

## Border Radius Scale

| Element | Radius |
|---------|--------|
| Pill buttons, inputs, filter tags | `16px` |
| Message bubbles (user) | `14px 14px 4px 14px` |
| Message bubbles (assistant) | `14px 14px 14px 6px` |
| Cards (tool calls, sources, reasoning) | `10px` |
| Sidebar items | `8px` |
| Sidebar logo | `6px` |
| Modals/dialogs | `12px` |

## Shadows

1. **Card/input shadow**: `box-shadow: 0 1px 3px rgba(0,0,0,0.03)` — barely visible, just enough to lift from background
2. **Button shadow**: `box-shadow: 0 1px 6px rgba(200,130,70,0.2)` — warm tinted shadow
3. **User bubble shadow**: `box-shadow: 0 1px 6px rgba(200,130,70,0.15)`
4. **No heavy shadows** — the design relies on borders and subtle elevation, not dramatic depth

## Typography

- **Font stack**: System font (`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- **Antialiasing**: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale`
- **Scale**: 9px (captions/badges), 10px (body), 11px (small headers), 13px (section headers), 16px (page titles)
- **Weights**: 400 (body), 500 (medium), 600 (semibold), 650-700 (bold/headers)
- **Letter spacing**: Default for body, `-0.3px` for logo

## Component Specifications

### Sidebar
- Background: `#f5f1ec` (warm beige)
- Right border: `1px solid #e8e0d5`
- Logo: 18px rounded square with orange gradient + bold "AgentRAG" text (#3d3530, weight 650)
- Active thread: `#fefaf5` background, `#f0d8b8` border, `#8b5e3c` text
- Inactive thread: `#9e8b78` text, no background
- Bottom nav: warm dot indicators + `#b8a48e` text

### Message Bubbles
- **User**: Orange gradient `#e8954c → #d4704a`, white text, right-aligned, `14px 14px 4px 14px` radius, warm shadow
- **Assistant**: White `#fff` background, `#f0e0c8` border, `#5c4a3a` text, `14px 14px 14px 6px` radius, minimal shadow
- **Loading**: Subtle animated dots in warm orange

### Tool Call Cards
- Background: `#fefcf9`, border: `1px solid #f0e0c8`, radius: 10px
- Header: icon + tool name + status indicator + expand chevron
- Status dots: green (`#6b9c5a`) for done, warm amber (`#d4905e`) for running, soft red (`#dc5a5a`) for error
- Icons: lucide-react icons in `#8b7355`
- Expanded content: result text with max-h scroll, nested children left-indented

### Reasoning Panel
- Dashed border: `1px dashed #e8d5b8`, background: `#fefcf9`
- Header: brain emoji + "Thinking (N steps)" + expand arrow, text in `#b8a48e`
- Steps: separated by dashed borders, truncated at 500 chars

### Input Area
- Input: 16px pill radius, white `#fff` background, `#e8e0d5` border, `#b8a48e` placeholder
- Send button: orange gradient, 16px pill, white text, warm shadow
- Disabled: reduced opacity (50%), no shadow

### Filter Bar
- Tags: 16px pill, `#f5f1ec` background, `#e8e0d5` border, `#8b7355` text
- Active tag: slightly darker border, `#fefaf5` background
- Clear button: text style, `#9e8b78` color

### Source Cards
- Background: `#fefcf9`, border: `1px solid #f0e0c8`, radius: 8px
- File icon + filename + relevance score in warm orange
- Expandable content preview

### Scrollbar
- Thin (6px), warm-toned
- Thumb: `#d0c0a8`, track: transparent
- Hover thumb: `#b8a080`

### Login Page
- Centered card on warm cream background
- Card: white, subtle border, 12px radius, minimal shadow
- Inputs: pill shape, white bg, warm border
- Submit button: full-width orange gradient pill
- Link text: `#8b5e3c` with hover underline

## Layout

- Full height `h-screen` flex layout
- Sidebar: 240px fixed width
- Main chat: flex-1, messages centered with max-width
- No top header — sidebar logo serves as app identity

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/index.css` | Complete theme rewrite: warm colors, border radius, shadows |
| `frontend/src/pages/Chat.tsx` | Updated bubble styles, warm class names |
| `frontend/src/pages/Login.tsx` | Warm theme, orange gradient button |
| `frontend/src/pages/Import.tsx` | Warm card styles |
| `frontend/src/pages/Settings.tsx` | Warm form styles |
| `frontend/src/components/ToolCallCard.tsx` | Warm borders, warm status dots |
| `frontend/src/components/ReasoningPanel.tsx` | Warm dashed borders, beige bg |
| `frontend/src/components/SourceCard.tsx` | Warm card, orange score |
| `frontend/src/components/FilterBar.tsx` | Warm pill tags |

## Implementation Notes

1. Rewrite `index.css` `@theme` block with all new warm color tokens
2. Remove dark mode `.dark` class (single warm theme)
3. Update `tailwind.config` or `@theme` with new border-radius scale
4. All gradients are CSS `linear-gradient`, no new dependencies
5. Component structure unchanged — only class names and inline styles change
6. Test all pages: Login, Chat (with messages/tool calls/sources), Import, Settings
