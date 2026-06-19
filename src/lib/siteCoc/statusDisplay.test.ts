import { describe, it, expect } from "vitest";
import { scheduleStatusTone, verdictTone, ruleTone } from "./statusDisplay";

describe("scheduleStatusTone", () => {
  it("maps the register status prefixes", () => {
    expect(scheduleStatusTone("OK — initial present")).toBe("green");
    expect(scheduleStatusTone("MISSING — no electrical CoC")).toBe("red");
    expect(scheduleStatusTone("FLAG — initial referenced, not on file")).toBe("amber");
    expect(scheduleStatusTone("N/A")).toBe("slate");
    expect(scheduleStatusTone("")).toBe("slate");
  });
});

describe("verdictTone", () => {
  it("maps verdict prefixes", () => {
    expect(verdictTone("PASS")).toBe("green");
    expect(verdictTone("PASS — minor fields unrecorded (C7)")).toBe("green");
    expect(verdictTone("FAIL")).toBe("red");
    expect(verdictTone("CV")).toBe("amber");
    expect(verdictTone("")).toBe("slate");
  });
});

describe("ruleTone", () => {
  it("maps a single cell value", () => {
    expect(ruleTone("PASS")).toBe("green");
    expect(ruleTone("FAIL")).toBe("red");
    expect(ruleTone("CV")).toBe("amber");
    expect(ruleTone("N/A")).toBe("slate");
    expect(ruleTone("")).toBe("slate");
  });
});
