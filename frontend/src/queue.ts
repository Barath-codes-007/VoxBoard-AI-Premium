// Speech phrase queue: drops duplicates and empty phrases.
export function makeQueue() {
  let last = "";
  return (phrase: string): string | null => {
    const p = phrase.trim();
    if (!p || p.toLowerCase() === last.toLowerCase()) return null;
    last = p; return p;
  };
}
