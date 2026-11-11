import { describe, expect, it } from "vitest";
import { parseDecInput, parseRaInput } from "./manualCoords";

describe("parseRaInput", () => {
  it("reads sexagesimal in several spellings", () => {
    const want = (5 + 35 / 60 + 17 / 3600) * 15;
    for (const s of ["05h 35m 17s", "5:35:17", "5 35 17", "5h35m17s"]) {
      expect(parseRaInput(s)).toBeCloseTo(want, 6);
    }
  });
  it("reads decimal hours", () => {
    expect(parseRaInput("6")).toBe(90);
    expect(parseRaInput("5.5")).toBeCloseTo(82.5, 6);
  });
  it("rejects junk and out-of-range values", () => {
    for (const s of ["", "abc", "24", "25h", "5h 61m", "1 2 3 4", "5 deg"]) {
      expect(parseRaInput(s)).toBeNull();
    }
  });
});

describe("parseDecInput", () => {
  it("reads signed sexagesimal", () => {
    const abs = 5 + 23 / 60 + 28 / 3600;
    expect(parseDecInput("-05° 23' 28\"")).toBeCloseTo(-abs, 6);
    expect(parseDecInput("+05:23:28")).toBeCloseTo(abs, 6);
    expect(parseDecInput("−5 23 28")).toBeCloseTo(-abs, 6);
  });
  it("keeps the sign of -0 degrees", () => {
    expect(parseDecInput("-0 30 0")).toBeCloseTo(-0.5, 6);
  });
  it("reads decimal degrees", () => {
    expect(parseDecInput("-5.39")).toBeCloseTo(-5.39, 6);
    expect(parseDecInput("90")).toBe(90);
  });
  it("rejects junk and out-of-range values", () => {
    for (const s of ["", "north", "91", "-90.5", "10 60 0"]) {
      expect(parseDecInput(s)).toBeNull();
    }
  });
});
