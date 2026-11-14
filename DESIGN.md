# DESIGN.md — Draft Assist LoL

## Mode

**Operate.** The visitor is mid-task, under time pressure, and needs to read the board and choose. Familiarity, density, and state clarity outrank expression. The visual world is a coach's draft sheet: graphite surfaces, thin rules, team-color semantics, and one warm decision accent.

## Scene

Low-light team room, 1440×900 desktop window, champion select on a second monitor. Dark is chosen from the scene, not from a gaming cliché: the board is a quiet surface that keeps the blue/red sides and the champion art legible.

## Direction

**Draft sheet, not esports overlay.** The interface reads like a working analyst board: a top context strip, two horizontal team rows, a central ban ledger, then a recommendation column. No neon glow, no gradient text, no decorative glass. The memorable moment is the live board: a pick locks into the current slot and the recommendation column answers with ranked, explained cards.

## Tokens

### Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#090c11` | Window ground |
| `--surface` | `#10151c` | Panels |
| `--surface-raised` | `#141b24` | Champion slots |
| `--surface-quiet` | `#0c1117` | Team blocks, inputs |
| `--line` | `#25303c` | Rules and borders |
| `--line-strong` | `#354456` | Selected/filled borders |
| `--text` | `#e9eef5` | Primary text |
| `--text-soft` | `#b9c5d3` | Secondary text |
| `--muted` | `#8b9aab` | Supporting copy |
| `--muted-2` | `#7a8a9b` | Labels, data keys |
| `--blue` | `#5a9ff2` | Blue side / pick |
| `--red` | `#ef7373` | Red side / ban / denial |
| `--gold` | `#e8bd73` | Decision accent, primary action, comfort |
| `--green` | `#70d3a5` | Success / A tier |
| `--violet` | `#9a8cf0` | AP damage split |

Blue and red are semantic, not decoration: they identify sides. Gold is reserved for the current decision, primary action, comfort meters, and S tier. Do not use gold as a generic highlight.

### Type

- One family: `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`.
- Fixed rem scale, not fluid. H1 26px, H2 18–21px, body 12–14px, UI labels 11px.
- Labels: 11px, uppercase, `letter-spacing: 0.10em`, only for field names or data keys. They never sit above a heading as an eyebrow.
- Numerals are tabular in scores, counts, paths, and comfort.
- Monospace is limited to ranks and file paths, where it carries measurement.

### Shape and depth

- Radii: 15px panels, 11px inner panels, 7–9px slots/buttons, 3–5px badges.
- Elevation is declared once: 1px rules on work surfaces; soft float shadow only on dialogs and toasts.
- No zero-offset halo, no hard offset shadow, no nested cards.

### Spacing

- 4px base. 20–24px page gutters; 14–18px panel padding; 8–12px grid gaps.
- More space above a heading than below it. Tight groups for labels and values; generous separation between team rows.

## Composition

1. **Topbar** (62px): wordmark, draft context (format, side, turn, example/preview state), then undo, change turn, new draft, load example.
2. **Viewbar** (46px): Draft / Equipo / Ajustes. The active tab is a 2px gold rule.
3. **Draft view** (two columns at ≥1050px): board 1fr, recommendation 390–420px. The recommendation column is sticky and scrolls independently.
4. **Board**: enemy team row, ban ledger, center turn rule, our team row, then composition summary.
5. **Recommendation column**: turn header, current player, warnings, top-five cards, then tentative next picks.

At ≤1050px the recommendation column moves below the board. Champion slots collapse from five to three to two columns. The topbar wraps at ≤860px.

## Components

### Champion slot

- Five per row. Role badge + player name top line, 45px champion icon + name + damage type, comfort meter or role at the bottom.
- Empty: dashed border, role and player, a plus only when the slot is actionable. The current slot uses a gold border and “Turno actual”.
- Filled: 1px side-tinted border. Enemy slot: red tint. Our slot: blue tint. No glow.
- Filled slots are not clickable; corrections go through undo.

### Ban ledger

- Five 25px slots per team, grayscale portraits, dashed empties with a plus when the team can ban.
- The plus is the only action affordance; it never appears on a team that is not banning.

### Recommendation card

- Grid: rank, 42px portrait, text block, score block, action.
- Text: champion name, role, comfort meter or off-pool badge; two-line justification; meta row with role, comfort, and one risk.
- Score: tier badge, one-decimal score, 54px score track.
- Action: gold “Elegir” for picks; red outline “Banear” for bans.
- Off-pool: dashed gold badge, “Fuera de pool”, muted gold-tinted surface. Ban cards in our pool show “En tu pool”.
- State: hover lifts surface only; focus ring gold; disabled action fades.

### Chips and tags

- Need chips: outlined, severity-tinted at high/mid, with numeric severity. Priorities: transparent chips that turn gold when active.
- Damage split: single 5px bar, gold AD and violet AP; labels above.

### Dialogs

- Native `<dialog>`, soft float shadow, no backdrop blur.
- Champion picker: search field, role filter chips, 4–6 column grid of champion cards. Unavailable cards are disabled and sorted last.
- New draft and change-turn dialogs use a single select plus a segmented side control.

## Motion

- 150–250ms, exponential ease-out. Recommendations enter with a 240ms stagger (28ms per card). Slots and buttons transition border/background only.
- No page-load choreography. No looping decoration. Respect `prefers-reduced-motion`.
- The only authored moment is the recommendation list answering a board action; everything else is state feedback.

## States

Every interactive surface must provide default, hover, focus, active, disabled, loading, error, empty.

- Loading: skeleton board and skeleton advice panel.
- Empty recommendation: explains why and offers the manual picker.
- Enemy turn: explicit “Registrar pick/ban” panel instead of fake recommendations.
- Draft complete: summary + new draft + example actions.
- Errors: inline notice for recoverable warnings; fatal state with retry for bootstrap failure.
- Toasts: bottom-right, capped width, auto-dismiss, manual close.

## Accessibility

- Body and placeholder text ≥4.5:1; large text ≥3:1. Muted labels remain above 4.5:1 on their surfaces.
- Focus visible: 2px gold ring with 2px offset.
- Buttons name their action; icon-only buttons carry `aria-label`.
- Dialogs trap focus natively. Search is focused on open; `/` focuses search when the picker is open.
- Color is never the only signal: side has a text label; tier has a letter; needs have text and severity; off-pool has a badge and warning.
- Keyboard: `Ctrl/Cmd+Z` undo, `Escape` closes dialogs, tab order follows the visual order.

## Copy

- Spanish, second person, direct. “Elegir”, “Banear”, “Registrar pick”, “Cambiar turno”.
- Errors name the problem and the recovery: “No se pudo determinar el jugador actual. Revisa el orden de picks.”
- No hype, no emoji, no exclamation marks.

## Data presentation

- Synthetic example data is labeled “Ejemplo” in the topbar.
- Static browser preview is labeled “Vista previa”.
- Champion icons are local 48×48 Data Dragon assets, displayed at 25–45px. Do not upscale beyond source resolution.
- Scores are one decimal, tabular. Tiers: S gold, A green, B blue, C muted, D muted-2.
