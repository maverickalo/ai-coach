export function assertTextIncludes(reply: string, expected: string[]): string[] {
  const normalizedReply = reply.toLowerCase();
  return expected
    .filter((text) => !normalizedReply.includes(text.toLowerCase()))
    .map((text) => `Expected reply to include "${text}"`);
}

export function assertTextExcludes(reply: string, excluded: string[]): string[] {
  const normalizedReply = reply.toLowerCase();
  return excluded
    .filter((text) => normalizedReply.includes(text.toLowerCase()))
    .map((text) => `Expected reply not to include "${text}"`);
}
