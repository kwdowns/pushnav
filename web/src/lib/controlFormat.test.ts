import { describe, expect, it } from "vitest";
import { formatControlValue } from "./controlFormat";

describe("formatControlValue", () => {
  it("formats Linux/macOS 100us exposure", () => {
    expect(formatControlValue(312, "100us")).toBe("31.2 ms");
    expect(formatControlValue(5000, "100us")).toBe("500 ms");
  });

  it("formats Windows log2(seconds) exposure", () => {
    expect(formatControlValue(-5, "log2s")).toBe("31.3 ms");
    expect(formatControlValue(-1, "log2s")).toBe("500 ms");
    expect(formatControlValue(0, "log2s")).toBe("1.00 s");
  });

  it("applies display_scale to exposure", () => {
    expect(formatControlValue(-1, "log2s", 2)).toBe("1.00 s");
    expect(formatControlValue(1250, "100us", 2)).toBe("250 ms");
  });

  it("formats gain in tenths of x", () => {
    expect(formatControlValue(10, "x10")).toBe("1.0×");
    expect(formatControlValue(155, "x10")).toBe("15.5×");
  });

  it("leaves raw values alone", () => {
    expect(formatControlValue(32, "raw")).toBe("32");
    expect(formatControlValue(7)).toBe("7");
  });
});
