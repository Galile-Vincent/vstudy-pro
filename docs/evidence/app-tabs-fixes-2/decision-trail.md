# Decisions

The goal is Safari-style multi-tab support in VStudy Pro without a Back regression or a second hosted Chat runtime.

The throughput checkpoint is the sequential Electron run. Build each baseline once, run swipe-history twice, and use one final sequential verification driver. Keep focused jsdom checks separate from Electron. No delegate is started because this is the implementation sub-agent brief.

Both ab3e3f28 and 993e0eed fail twice at native app-command Back. The code-round app-command handler is unchanged. The observed native focus is false, DOM focus is true, and the overlay query is empty. The command handler therefore returns before sending keyboard input. Do not change the production focus guard or overlay predicate.

A five-second native-focus wait also fails. Explicit app.show, window.show and regular activation policy do not acquire focus. Those experimental changes are removed. Keep the native-focus precondition in the harness so an unavailable native input path cannot become a misleading route timeout.

Hosted Chat has two runtime ownership modes. The host owns its runtime from creation through completion. A standalone child owns useLocalRuntime only when no host exists. Runtime-dependent effects mount only after the selected runtime exists. The regression test checks both hosted loading and ready states.
