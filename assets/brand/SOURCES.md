# Brand sources

The owner supplied this butterfly logo pack on 2026-11-06. `originals/` preserves every supplied SVG, PNG, JPG, and README byte for byte. The source archive was `0db1a864-af07-4ffd-a98d-d464bfa7ea0e-b2cfdebc-6388-4c01-a646-dac65db56f71-zip.zip`.

Run `pnpm brand` on macOS to validate every SVG, compare original and optimized renders, and regenerate the UI logos, website metadata, and platform icons. The generator uses Sharp and SVGO. It rejects executable SVG content, raster embeds, and nonlocal references. `generated/validation.json` records the comparison results.

UI logos retain the owner's gradients and outlined lettering. Tight viewBoxes remove export padding. The light and dark lockups have transparent backgrounds. macOS uses the supplied light icon inside an 824px body centered on a transparent 1024px canvas with a soft shadow. Windows and Linux use the full artwork. The desktop lockup follows the resolved theme scheme rather than the operating system preference.
