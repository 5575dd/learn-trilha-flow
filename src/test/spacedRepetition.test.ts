import { describe, expect, it } from "vitest";
import { calculateSpacedRepetition } from "@/domain/review/spacedRepetition";

const base = new Date("2026-07-25T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const day = 24 * hour;

describe("spaced repetition policy", () => {
  it("schedules an incorrect answer in four hours", () => {
    const result = calculateSpacedRepetition("incorrect", 4, base);
    expect(result.consecutiveCorrect).toBe(0);
    expect(result.intervalMs).toBe(4 * hour);
    expect(result.nextReviewAt?.toISOString()).toBe("2026-07-25T16:00:00.000Z");
    expect(result.incrementTotalAttempts).toBe(true);
    expect(result.incrementTotalCorrect).toBe(false);
  });

  it("schedules the first consecutive correct answer in one day", () => {
    const result = calculateSpacedRepetition("correct", 0, base);
    expect(result.consecutiveCorrect).toBe(1);
    expect(result.intervalMs).toBe(day);
  });

  it("schedules the second consecutive correct answer in three days", () => {
    expect(calculateSpacedRepetition("correct", 1, base).intervalMs).toBe(3 * day);
  });

  it("schedules the third consecutive correct answer in seven days", () => {
    expect(calculateSpacedRepetition("correct", 2, base).intervalMs).toBe(7 * day);
  });

  it("schedules the fourth consecutive correct answer in fourteen days", () => {
    expect(calculateSpacedRepetition("correct", 3, base).intervalMs).toBe(14 * day);
  });

  it("schedules the fifth consecutive correct answer in thirty days", () => {
    expect(calculateSpacedRepetition("correct", 4, base).intervalMs).toBe(30 * day);
  });

  it("caps later correct answers at thirty days", () => {
    expect(calculateSpacedRepetition("correct", 99, base).intervalMs).toBe(30 * day);
  });

  it("uses the injected base time", () => {
    expect(calculateSpacedRepetition("correct", 0, base).nextReviewAt?.getTime()).toBe(
      base.getTime() + day,
    );
  });

  it.each(["neutral", "skipped", "invalid"] as const)(
    "does not treat %s as a correct or reviewable attempt",
    (status) => {
      expect(calculateSpacedRepetition(status, 3, base)).toEqual({
        consecutiveCorrect: 3,
        intervalMs: null,
        nextReviewAt: null,
        incrementTotalCorrect: false,
        incrementTotalAttempts: false,
      });
    },
  );

  it("rejects an invalid previous streak", () => {
    expect(() => calculateSpacedRepetition("correct", -1, base)).toThrow(RangeError);
  });
});
