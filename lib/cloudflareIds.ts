// Cloudflare zone/record/account IDs are 32-char lowercase hex, but we accept
// a slightly wider alphanumeric charset to be forgiving of format changes.
// The point is blocking path-traversal / fragment / query-injection
// characters before these values are interpolated into an outbound URL.
const CLOUDFLARE_ID_PATTERN = /^[a-zA-Z0-9]{1,64}$/;

export const isValidCloudflareId = (value: string): boolean =>
  CLOUDFLARE_ID_PATTERN.test(value);
