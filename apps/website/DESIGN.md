# Website design, v2

The home page persuades through the real product. Documentation helps students understand the current app and its limits. The owner supplied the direction and authorized the implementation agent to compare three prototypes and choose one.

## Visual decisions

Use neutral #fafafa and white in light mode, #0b0b0d and neutral charcoal in dark mode. Keep the page canvas neutral when the palette changes. App screenshots supply most color. One accent follows the selected app palette.

Use the native font stack to match the macOS app and avoid font requests. The hero reaches 92px, with explicit localized line breaks. Body copy stays at 16px and feature descriptions at 14px. A 1200px container uses 32px desktop and 20px mobile gutters.

The centered aurora prototype won over split studio and paper. It keeps the product legible at full width and gives the headline more presence. A slow glow behind the window is the single ambient gesture. Product motion, reveals, and approval entrance use transforms and opacity. A pause button stops them. Reduced motion also disables theme animation.

The seven bento cards have mixed widths and real screenshots or local demonstrations. Their order is courses, approval, history, reading, themes, Moodle, and MCP. Examples label their data. MCP remains coming soon until its documentation and implementation land on main.

Headers have no bottom border. A pseudo-element fades in a neutral blurred background and faint shadow after scrolling. Sidebars stay flat and quiet. Dense FAQ rows and documentation content can use rules.

## Theme behavior

The scheme initializes inline before first paint. Color interpolation starts only after initialization. Both scheme and palette controls call the shared 280ms View Transitions crossfade. Registered color properties interpolate when the API is unavailable. Rapid toggles skip the old transition. Palette selection does not persist. Manual scheme selection does.

## Evidence

See ../../docs/WEBSITE_DESIGN_NOTES.md and ../../docs/evidence/website-v2/VERIFICATION.md for the decision, browser checks, source captures, and completed integration checks.
