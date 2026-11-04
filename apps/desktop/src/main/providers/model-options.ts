export const option = (id: string, label: string, values: string[], initial = values[0] ?? '') => ({ id, label, values: values.map(id => ({ id, label: id })), default: initial });
