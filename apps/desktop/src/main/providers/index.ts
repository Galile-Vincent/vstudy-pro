import type {
  ChatEvent,
  ChatRequest,
  ProviderConfig,
} from "../../shared/domain";
export type Availability =
  | { available: true }
  | { available: false; reason: string };
export interface Model {
  id: string;
  name: string;
}
export interface ProviderAdapter {
  detect(): Promise<Availability>;
  listModels(): Promise<Model[]>;
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
}
export class ProviderRegistry {
  private readonly adapters = new Map<ProviderConfig["id"], ProviderAdapter>();
  register(id: ProviderConfig["id"], adapter: ProviderAdapter): void {
    if (this.adapters.has(id))
      throw new Error(`Provider already registered: ${id}`);
    this.adapters.set(id, adapter);
  }
  get(id: ProviderConfig["id"]): ProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Provider not registered: ${id}`);
    return adapter;
  }
}
