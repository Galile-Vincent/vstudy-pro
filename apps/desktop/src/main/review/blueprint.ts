export const BLUEPRINT_COUNTS = { small: 8, medium: 12, large: 20 } as const;
export interface BlueprintSlot {
    id: string;
    conceptKey: string;
    type: 'mcq' | 'cloze' | 'true_false';
    difficulty: 'easy' | 'medium';
    bloom: 'remember_understand' | 'apply' | 'analyze_evaluate';
}
export function buildBlueprint(concepts: readonly string[], unitCount: number, size?: 'short' | 'standard' | 'long') {
    const keys = [...new Set(concepts)], count = size ? BLUEPRINT_COUNTS[({short:'small',standard:'medium',long:'large'} as const)[size]] : unitCount <= 1 ? BLUEPRINT_COUNTS.small : unitCount <= 4 ? BLUEPRINT_COUNTS.medium : BLUEPRINT_COUNTS.large;
    const slots: BlueprintSlot[] = [];
    if (keys.length < 2 || keys.length > count)
        return { status: 'infeasible' as const, reason: 'Insufficient slots or concepts for coverage and interleaving', slots };
    for (let i = 0; i < count; i++)
        slots.push({ id: `q${i + 1}`, conceptKey: keys[i % keys.length]!, type: (['mcq', 'cloze', 'true_false'] as const)[i % 3]!, difficulty: i < 2 ? 'easy' : 'medium', bloom: i < 2 ? 'remember_understand' : i % 2 ? 'apply' : 'analyze_evaluate' });
    return { status: 'ready' as const, reason: null, slots };
}
