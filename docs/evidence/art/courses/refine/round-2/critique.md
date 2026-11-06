# Refinement critique 2

The side-by-side board is references-comparison.png. The refined card now has the luminous color of the second reference and the quiet type hierarchy of the first. The fine contour lines read as artwork rather than opaque UI decoration. The title is larger than the teacher and footer. Deadline and completion sit directly on the art, leaving a shorter body.

The Grove hero is continuous art from the top bar to its lower corners. Code, title, teacher, actions, and next work have a clear order. Glass actions and a glowing deadline chip remain readable on the scrim. The neighboring content cards use the same 20px radius and low-alpha ring-plus-24px shadow as Quiet folio.

One accessibility detail still needs correction. The high-contrast progress ring must use ink on the surface, and the deadline glow must disappear. Set the art foreground/base roles explicitly in that pack and remove its glow before the final matrix.

The artwork intentionally uses deterministic gradients and contours rather than copying the reference's raster marble texture. This keeps each course recognizable without fetching heavy images. The image-backed fixture cards receive the same theme-derived color treatment.
