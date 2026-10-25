/** Headers added to every response, beside the CSP. HSTS only in production: it would lock http://localhost out. */
export function extraHeaders(dev: boolean): Record<string, string> {
  return dev ? {} : { "strict-transport-security": "max-age=31536000; includeSubDomains" };
}
