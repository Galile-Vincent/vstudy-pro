/** Limits apply to the final escaped bytes; never cut a serialized structure. */
export function serializeUntrusted(value: unknown, maxBytes = 96 * 1024): string {
    const json = JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
    const result = '<UNTRUSTED_REVIEW_DATA>\n' + json + '\n</UNTRUSTED_REVIEW_DATA>';
    if (Buffer.byteLength(result) > maxBytes)
        throw new Error('review.input_limit');
    return result;
}
