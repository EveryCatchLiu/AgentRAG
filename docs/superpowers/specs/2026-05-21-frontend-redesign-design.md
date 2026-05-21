# AgentRAG Frontend Redesign — Tech-Stylish (科技感)

**Date**: 2026-05-21
**Status**: Approved
**Direction**: Deep Solid + Rounded Soft + Glassmorphism Palette

## Design Goals

Transform the shadcn/ui default neutral-gray theme into a distinctive, tech-forward visual identity that conveys precision, intelligence, and modernity.

## Color System

### Dark Theme (Default)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `linear-gradient(135deg, #0a0a1a, #0f1025, #0d1225, #0a0f20)` | Full page background |
| `--foreground` | `#e0e0f0` | Primary text |
| `--card` | `#141b2e` | Card, message bubble, panel backgrounds |
| `--card-foreground` | `#c9d1d9` | Card text |
| `--primary` | `linear-gradient(135deg, #6366f1, #8b5cf6)` | Primary buttons, avatar, accent elements |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` | `#1e2746` | Secondary backgrounds, borders |
| `--muted` | `#141b2e` | Muted backgrounds |
| `--muted-foreground` | `#8b9ab8` | Secondary text, labels |
| `--accent` | `rgba(99,102,241,0.15)` | Active states, highlights |
| `--accent-foreground` | `#c7d2fe` / `#a5b4fc` | Active text |
| `--border` | `rgba(255,255,255,0.06)` | Card borders, separators |
| `--ring` | `rgba(99,102,241,0.4)` | Focus rings |
| `--destructive` | `#ef4444` | Error states |

### Accent Gradients

- **Primary gradient**: `#6366f1` → `#8b5cf6` (indigo to purple)
- **Avatar glow**: `box-shadow: 0 0 12px rgba(99,102,241,0.35)` 
- **Top-edge light bars**: `linear-gradient(90deg, transparent, rgba(99,102,241,0.2), transparent)` on card tops
- **Button shadow**: `box-shadow: 0 2px 12px rgba(99,102,241,0.3)`

### Status Colors

- **Success**: `#22c55e` (green)
- **Warning**: `#f59e0b` (amber)
- **Error**: `#ef4444` (red)
- **Info**: `#6366f1` (indigo)

## Border Radius Scale

| Element | Radius |
|---------|--------|
| Pill buttons, inputs | `20px` (full round) |
| Message bubbles | `16px 16px 4px 16px` (user, right-bottom sharp) / `16px 16px 16px 6px` (assistant, left-bottom slight) |
| Cards (tool calls, sources, reasoning) | `12px` |
| Sidebar items | `12px` |
| Modals/dialogs | `16px` |

## Glow and Light Effects

1. **Avatar/logo glow**: Rounded gradient icon with `box-shadow: 0 0 12px` in primary color
2. **Top-edge gradient**: 1px `linear-gradient` bar at the top of message bubbles and cards, fading from transparent through accent to transparent
3. **Button glow**: Primary buttons get `box-shadow: 0 2px 12px rgba(99,102,241,0.3)`
4. **Status dots**: Small colored circles with matching `box-shadow` glow
5. **Active sidebar item**: Left border highlight + subtle gradient background

## Typography

- **Font stack**: System font (`system-ui, -apple-system, sans-serif`)
- **Antialiasing**: `-webkit-font-smoothing: antialiased`
- **Scale**: 9px (captions), 10px (body), 11px (small headers), 13px (section headers)
- **Weights**: 400 (body), 500 (medium emphasis), 600-700 (headers)
- **Letter spacing**: `-0.3px` on logo and headers for tighter look

## Component Specifications

### Sidebar
- Dark solid background: `rgba(10,10,25,0.95)`
- Right border: `1px solid rgba(99,102,241,0.12)`
- Logo: gradient circle + AgentRAG text, weight 700
- Thread items: 12px border radius, active state with gradient background + subtle border
- Bottom nav: glowing dot indicators + muted text

### Message Bubbles
- **User**: Gradient `#6366f1 → #7c3aed` background, white text, right-aligned, 16px 16px 4px 16px radius, soft shadow
- **Assistant**: `#141b2e` background with top-edge gradient bar, `#c9d1d9` text, 16px 16px 16px 6px radius
- **Loading**: Animated shimmer or spinner in muted colors

### Tool Call Cards
- Background: `#141b2e`, border: `1px solid rgba(255,255,255,0.06)`, radius: 12px
- Header row: icon + name + status dot + expand chevron
- Status: green check for done, amber spinner for running, red X for error
- Expanded content: result text (max-h with scroll), nested children indented
- Web search: search icon + purple glow dot
- Database query: database icon + blue glow dot
- Sub-agent: bot icon + indigo glow dot

### Reasoning Panel
- Dashed border: `rgba(99,102,241,0.2)`, background: `#0f1625`
- Header: brain emoji + "Thinking (N steps)" + expand arrow
- Steps: separated by dashed borders, truncated at 500 chars

### Input Area
- Rounded pill input: 20px radius, `#141b2e` background, subtle border
- Send button: primary gradient, pill shape, glow shadow
- Disabled state: reduced opacity

### Filter Bar
- Pill-shaped select tags: 20px radius, muted background
- Multi-select with subtle active state
- Clear button: text style, muted color

### Source Cards
- Background: `#0f1625`, subtle border
- File icon + filename + similarity score
- Expandable to show content preview

### Scrollbar
- Thin, semi-transparent, matching accent color
- `::-webkit-scrollbar` styled with `#6366f133` thumb

## Layout

### Page Structure
- Full height `h-screen` flex layout
- Sidebar: fixed 240px (was 256px/16rem), collapsible (future)
- Main chat: flex-1, centered max-width for messages
- No header bar — sidebar logo serves as app header

### Responsive
- Mobile: sidebar hidden behind hamburger (future enhancement)
- Current: desktop-first, minimum usable at 768px

## Implementation Notes

1. Migrate from Tailwind v4 CSS-based theme (`@theme`) to CSS custom properties for gradient support
2. Replace `bg-muted`, `bg-accent` etc. with new color tokens throughout
3. Extract inline tool call rendering in Chat.tsx to ToolCallCard (already done in Module 8)
4. Replace all border-radius values with the new scale
5. Add the top-edge gradient bar to message bubbles and cards via a CSS utility or inline style
6. Keep existing component structure — only restyle
7. No new dependencies needed — all effects are pure CSS

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/index.css` | Complete rewrite of theme tokens, add glow/gradient utilities |
| `frontend/src/pages/Chat.tsx` | Updated class names, gradient message bubbles, glow effects |
| `frontend/src/pages/Login.tsx` | Updated theme, gradient button |
| `frontend/src/pages/Import.tsx` | Updated theme, card styles |
| `frontend/src/pages/Settings.tsx` | Updated theme, form styles |
| `frontend/src/components/ToolCallCard.tsx` | Glow dots, updated border radius, status indicators |
| `frontend/src/components/ReasoningPanel.tsx` | Updated colors, dashed borders |
| `frontend/src/components/SourceCard.tsx` | Updated card styles |
| `frontend/src/components/FilterBar.tsx` | Pill shapes, updated tag styles |
