# Expanded-string critique

The first pseudo capture still showed English because the harness imported the i18n file through a second Vite module URL. The corrected harness uses the canonical URL and requires expanded markers to appear in the actual header.

The expanded strings exposed a header overflow at 720×768 and 125% scale. The header actions now wrap beneath the title. The account chip uses an explicit narrow grid, so long school and sync labels cannot squeeze its identity column into one-character lines. The harness checks both page overflow and the chip's height. The final expanded captures pass both checks in light and dark.

The shared sidebar still truncates some expanded navigation labels. That component is outside U1 ownership. Courses controls, course hero content, and the course page remain within the horizontal page bounds.
