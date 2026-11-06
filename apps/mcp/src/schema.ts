/** Serialize app Zod 3.24 schemas through the SDK's Zod 3.25 converter without changing the contract. @packageDocumentation */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { mcpTools, toolResultSchema, type ToolName } from './contract';

type ContractSchema = typeof toolResultSchema | typeof mcpTools[ToolName]['schema'];

export function contractJsonSchema(schema: ContractSchema) {
  // Zod 3.25 changed recursive TypeScript types while keeping the Zod 3 definition format.
  return zodToJsonSchema(schema as unknown as Parameters<typeof zodToJsonSchema>[0], { $refStrategy: 'none' });
}
