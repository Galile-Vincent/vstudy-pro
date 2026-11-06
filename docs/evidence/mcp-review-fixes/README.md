# MCP defensive review fixes

The assignment regressions failed before the fix because approval omitted the existing attachment and remote text hash. Both now reject unsafe draft state, and no assignment tool calls final submission. The MCP and consent test run passes 206 tests. See [before](assignment-before.log) and [after](assignment-after.log).

Electron was not launched. The coordinator reserved its slot for streams P and C. Consent rendering is covered by the renderer tests, not screenshots or a live app run.
