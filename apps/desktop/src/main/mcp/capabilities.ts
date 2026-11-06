/** Remote tools fail closed when site-info functions are absent or unknown. @packageDocumentation */
import { mcpTools, type Capability, type ToolName } from '../../shared/mcp';

/** Cached-only tools need no remote function. Unknown remote capabilities are unsupported. */
export function capabilityMatrix(functions: readonly string[] | undefined): Capability[] {
  const available = new Set(functions ?? []);
  return (Object.keys(mcpTools) as ToolName[]).map(tool => {
    const missingFunctions = mcpTools[tool].functions.filter(name => !available.has(name));
    return {tool, supported: missingFunctions.length === 0, missingFunctions, hint: missingFunctions.length ? 'Use Moodle directly or enable the required mobile service at this school.' : 'Available through VStudy.'};
  });
}
