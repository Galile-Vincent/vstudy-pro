import { defaultSchema } from "rehype-sanitize";

export const schema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, src: ["data"] },
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "data-start",
      "data-end",
      "data-source-text",
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, "math-inline", "math-display"],
    ],
  },
};
