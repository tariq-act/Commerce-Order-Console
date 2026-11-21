export function queryParametersToObject(parameters: URLSearchParams) {
  const input: Record<string, string | string[]> = Object.create(null);
  for (const key of new Set(parameters.keys())) {
    const values = parameters.getAll(key);
    // Preserve repeated values so validation rejects ambiguous parameters.
    input[key] = values.length === 1 ? values[0] : values;
  }
  return input;
}
