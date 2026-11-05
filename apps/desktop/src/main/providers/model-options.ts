/**
 * Normalize provider model-option definitions for the shared picker contract.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
export const option = (id: string, label: string, values: string[], initial = values[0] ?? '') => ({ id, label, values: values.map(id => ({ id, label: id })), default: initial });
