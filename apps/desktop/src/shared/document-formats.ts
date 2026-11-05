/**
 * Keep import extensions and display format metadata in one registry.
 * Owned by shared.
 * This module is importable by both processes and must not depend on Electron or privileged IO.
 * @packageDocumentation
 */
export const documentFormats: Readonly<Record<string, string>> = {
  md: "text/markdown", txt: "text/plain", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  html: "text/html", htm: "text/html", csv: "text/csv",
};
