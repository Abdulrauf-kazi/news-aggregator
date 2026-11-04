// Near-duplicate decision for cross-source story merging.
//
// MiniLM is a bi-encoder: it rates "M 4.5 - 10 km S of Ridgecrest" vs
// "M 2.1 - 42 km N of Ridgecrest" (different events) at 0.94 while genuine
// paraphrases from different outlets sit around 0.5-0.8. Two cheap guards make
// the cosine score usable: a calibrated threshold and a numeric-conflict veto
// (both headlines quote figures and share none -> different events).
// Values chosen on eval/benchmark.json (see eval/RESULTS.md).

export const DEDUPE_SIMILARITY_THRESHOLD = Number(
  process.env.DEDUPE_SIMILARITY_THRESHOLD ?? 0.58,
);
// Lexical fallback vectors live in a different space and need a different cut.
export const LEXICAL_DEDUPE_SIMILARITY_THRESHOLD = 0.75;

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;

export const extractNumbers = (text: string) =>
  new Set(
    (text.match(NUMBER_PATTERN) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, "")),
  );

/** True when both texts quote numbers and have none in common. */
export const numbersConflict = (left: string, right: string) => {
  const a = extractNumbers(left);
  const b = extractNumbers(right);
  if (a.size === 0 || b.size === 0) return false;
  for (const n of a) if (b.has(n)) return false;
  return true;
};

export const isNearDuplicate = (input: {
  similarity: number;
  leftTitle: string;
  rightTitle: string;
  lexical?: boolean;
  threshold?: number;
}) => {
  const threshold =
    input.threshold ??
    (input.lexical ? LEXICAL_DEDUPE_SIMILARITY_THRESHOLD : DEDUPE_SIMILARITY_THRESHOLD);
  return input.similarity > threshold && !numbersConflict(input.leftTitle, input.rightTitle);
};
