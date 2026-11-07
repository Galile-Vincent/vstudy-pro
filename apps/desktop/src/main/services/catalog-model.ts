import type { ProviderRegistry } from '../providers';
import type { ProviderConfig } from '../../shared/domain';

export async function assertCatalogModel(providers: ProviderRegistry, providerId: ProviderConfig['id'], modelId: string, code: 'ai_parse.model_unavailable' | 'review.model_unavailable') {
  const adapter = providers.get(providerId);
  const model = (await adapter.listModels()).find(model => model.id === modelId || model.resolvedId === modelId);
  if (!model) throw new Error(code);
  return model;
}
