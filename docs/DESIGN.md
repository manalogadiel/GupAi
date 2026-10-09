# GupAi design system (revamp, Oct 9)

**Direction:** Pal.Do warmth with barbershop accents. The interface is a calm, warm room. The customer's mirror and the barber mascot are the two characters on stage, and everything else steps back.

**References:** the Pal.Do mobile and desktop screens; the barber-booking apps (green and peach, illustrated barber).

## Tokens
| Role | Token | Value | Use |
|---|---|---|---|
| Canvas | `--color-canvas` | `#F6F1E9` | Page background, with a faint paper grain overlay |
| Surface | `--color-surface` | `#FFFCF7` | Cards and sheets |
| Sunken | `--color-subtle` | `#EFE7DB` | Mirror well, input pills, chips |
| Peach | `--color-peach` | `#F4D9C4` | Illustration grounds, mascot blob, selected-option glow |
| Ink | `--color-ink` | `#26241F` | Text |
| Ink 2 | `--color-ink-2` | `#5C564C` | Secondary text (≥4.5:1 on canvas, surface and subtle) |
| Barber green | `--color-action` | `#2F5443` | Primary actions, selection, confirmed state |
| Voice orange | `--color-voice` | `#D9673A` | **Only** the mic button and the recording state |
| Error | `--color-error` | `#A52B2B` | Errors, always with words |
| Focus | `--color-focus` | `#285EAE` | 3 px focus ring |

**Shadows** are warm-tinted, never pure black:
- `--shadow-card`: `0 1px 2px rgb(74 52 30/.06), 0 10px 30px -8px rgb(74 52 30/.14)`
- `--shadow-lift`: `0 2px 4px rgb(74 52 30/.08), 0 18px 40px -12px rgb(74 52 30/.22)`

**Radius:**
- 12 px controls
- 24 px cards
- 32 px mirror
- full pill for inputs, chips and the mic

## Type
- **Display:** Instrument Serif 400, for big moments only: the Home headline and each step's question. Size `clamp(2.25rem, 4.5vw, 4rem)`, line-height 1.02, tracking −0.01em, `text-wrap: balance`.
- **UI and body:** Figtree Variable at 16 px, line-height 1.5. Labels are 500 weight and headings 600. Use `tabular-nums` for timers and versions.
- Sentence case everywhere. Taglish first, with English where it is clearer.

## Layout
- **Laptop (≥1280):**
  - centered container, max width 1440;
  - grid of 4 / 5 / 3 columns (prompt / mirror / agreement), and 3 / 6 / 3 at ≥1440;
  - a floating segmented step bar under the header.
- **Phone:** Pal.Do layout in one column:
  - mirror first;
  - then the mascot and question;
  - then content;
  - then a fixed bottom dock with a pill input, the big round mic, and an agreement tab that opens a draggable sheet.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 64. Bottom padding is optically larger than top padding.

## Motion (emil-design-eng + apple-design)
- **Easing:** `--ease-out: cubic-bezier(.23,1,.32,1)` for entering; springs (`stiffness 420, damping 32`) for selection, sheets, and the step indicator.
- **Durations:**
  - press 120 ms (scale .97);
  - hover 150 ms;
  - enter 200–260 ms;
  - sheet spring;
  - face-outline draw 700 ms (one time).
- Animate **transform and opacity only**. Everything is interruptible, and there is no animation on repeated high-frequency actions.
- **Allowed moments:**
  1. The step indicator slides between steps (shared layout).
  2. Agreement items enter and exit as Keep/Change/Avoid change.
  3. Option cards enter with a one-time 40 ms stagger; the selection springs with a green ring.
  4. The face outline draws on once when the face-shape result arrives.
  5. The mascot shows state: idle (breathe and blink), listening (while recording), thinking (while a job runs), happy (agreement confirmed).
  6. The mic ring follows the **real** input level while recording.
  7. The phone agreement sheet is draggable with a spring.
- **Forbidden:**
  - fake progress bars;
  - looping attention-seeking motion on idle buttons;
  - bouncing CTAs;
  - waveforms when the mic is off.
- `prefers-reduced-motion`: movement becomes opacity cross-fades, and the mascot holds a static pose per state.

## Components
- **Button:**
  - primary is green with white text;
  - secondary is a surface card with a hairline;
  - quiet is text only;
  - all ≥48 px tall.
- **Chip:** a pill on `subtle`. Pressed state is green with a check that springs in.
- **Card:** surface + `--shadow-card` + 24 px radius, no border. Use cards only where elevation means something.
- **MicButton:** 76 px round orange (88 on phone), with a white mic glyph. While recording it shows a level ring and a stop square. It never pulses when idle.
- **Segmented:** pill track on `subtle` with a green sliding thumb.
- **BarberMascot:** `idle | listening | thinking | happy`, driven only by real state:
  - recording → listening;
  - job running → thinking;
  - agreement fully confirmed → happy.

## Accessibility
- Every text pair is ≥4.5:1.
- Visible focus ring.
- Targets ≥48 px.
- Color is never the only signal (checks and words too).
- The mascot is `aria-hidden`.
- Job status is `role=status` with honest elapsed seconds.

## V2 operation refinements
Preserve the warm cream/peach/sage palette and blurred visual identity. On phones, recommendation and part alternatives use selectable tabs with one complete card visible; job state, ratings, and camera controls remain reachable. Desktop chat scrolls within its pane with input pinned. Reduced-motion preference is respected. Preview is illustrative; custom choices are labeled as descriptions.
