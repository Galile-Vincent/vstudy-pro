export function notePlan(unitCount: number, concepts: readonly {
    key: string;
    mastery: number;
}[], weak = false) {
    const words = unitCount <= 1 ? [400, 700] : unitCount <= 4 ? [700, 1200] : [1200, 1800];
    return { words, zhCharacters: words.map(n => n * 2), promptCount: unitCount <= 1 ? [6, 10] : unitCount <= 4 ? [10, 16] : [16, 24], reviewOffsets: [1, 3, 7, 14], concepts: concepts.slice(0, weak ? 8 : 12).map(c => ({ ...c, depth: c.mastery < .4 ? 'full' : c.mastery <= .75 ? 'faded' : 'brief', prompts: c.mastery < .4 ? 3 : c.mastery <= .75 ? 2 : 1 })), omitted: concepts.slice(weak ? 8 : 12).map(c => c.key) };
}
