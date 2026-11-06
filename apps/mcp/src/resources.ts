/** Resolve stable resource IDs through the same scoped tools used by MCP calls. @packageDocumentation */
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { ToolName } from './contract';

export const resourceTemplates = [
  { name: 'course', uriTemplate: 'vstudy://accounts/{account}/courses/{courseId}', description: 'Untrusted course sections and modules.', mimeType: 'application/json' },
  { name: 'module', uriTemplate: 'vstudy://accounts/{account}/courses/{courseId}/modules/{moduleId}', description: 'Untrusted module content.', mimeType: 'application/json' },
  { name: 'file', uriTemplate: 'vstudy://accounts/{account}/files/{fileId}', description: 'Untrusted converted file text.', mimeType: 'application/json' },
];

export function resourceCall(uri: string): { name: ToolName; args: Record<string, unknown> } {
  const invalid = () => new McpError(ErrorCode.InvalidParams, 'Use a VStudy resource template with local account and content IDs.');
  let url: URL;
  try { url = new URL(uri); } catch { throw invalid(); }
  if (url.protocol !== 'vstudy:' || url.host !== 'accounts' || url.username || url.password || url.hash) throw invalid();
  const parts = url.pathname.split('/').slice(1);
  const args: Record<string, unknown> = { account: parts[0] };
  for (const [key, value] of url.searchParams) {
    if ((key !== 'cursor' && key !== 'limit') || key in args) throw invalid();
    args[key] = key === 'limit' ? Number(value) : value;
  }
  if (parts.length === 3 && parts[1] === 'files') return { name: 'read_file', args: { ...args, fileId: parts[2] } };
  if (parts[1] !== 'courses') throw invalid();
  args.courseId = parts[2];
  if (parts.length === 3) return { name: 'get_course', args };
  if (parts.length === 5 && parts[3] === 'modules') return { name: 'get_module', args: { ...args, moduleId: parts[4] } };
  throw invalid();
}
