import { afterEach, describe, expect, it } from "vitest";
import { readStored, readStoredList, writeStored } from "./storage";

const original = Object.getOwnPropertyDescriptor(window, "localStorage");
afterEach(() => {
  if (original) Object.defineProperty(window, "localStorage", original);
});

describe("guarded storage", () => {
  it("round-trips values", () => {
    writeStored("k", "v");
    expect(readStored("k")).toBe("v");
    writeStored("k", null);
    expect(readStored("k")).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    const blocked = () => { throw new Error("blocked"); };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: blocked, setItem: blocked, removeItem: blocked },
    });
    expect(readStored("k")).toBeNull();
    expect(() => writeStored("k", "v")).not.toThrow();
  });

  it("ignores malformed lists", () => {
    writeStored("l", "{not json");
    expect(readStoredList("l")).toBeNull();
    writeStored("l", JSON.stringify(["a", 1, "b"]));
    expect(readStoredList("l")).toEqual(["a", "b"]);
  });
});
