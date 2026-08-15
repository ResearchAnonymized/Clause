import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  lexicalSimilarity,
  parsePgVector,
  similarityBand,
} from "./semantic-similarity";

describe("semantic-similarity", () => {
  it("parses pgvector text", () => {
    expect(parsePgVector("[0.1, 0.2, 0.3]")?.length).toBe(3);
    expect(parsePgVector(null)).toBeNull();
  });

  it("computes cosine of identical vectors as 1", () => {
    const v = [1, 0, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("computes cosine of orthogonal vectors as 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("lexical similarity rewards overlap", () => {
    const a = lexicalSimilarity(
      "Supplier shall maintain ninety nine uptime availability monthly",
      "Bidder maintains ninety nine uptime availability each month",
    );
    const b = lexicalSimilarity("uptime availability monthly", "pricing invoice fees commercial");
    expect(a ?? 0).toBeGreaterThan(b ?? 0);
  });

  it("bands similarity", () => {
    expect(similarityBand(0.85)).toBe("strong");
    expect(similarityBand(0.6)).toBe("moderate");
    expect(similarityBand(0.2)).toBe("weak");
    expect(similarityBand(null)).toBe("na");
  });
});
