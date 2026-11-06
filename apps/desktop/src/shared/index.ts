/**
 * Expose shared contracts without importing privileged main-process dependencies.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
export * from "./domain";
export * from "./ipc";

export * from './review-generate';
