import { describe, expect, it } from "vitest";
import { angularSepDeg, findNearest, type SkyPlace } from "./nearest";

const place = (name: string, ra_deg: number, dec_deg: number): SkyPlace => ({
  name, kind: "Test", ra_deg, dec_deg,
});

describe("angularSepDeg", () => {
  it("is zero for the same point and 90 from pole to equator", () => {
    expect(angularSepDeg(10, 20, 10, 20)).toBeCloseTo(0, 9);
    expect(angularSepDeg(123, 90, 45, 0)).toBeCloseTo(90, 6);
  });

  it("shrinks RA differences by cos(dec)", () => {
    expect(angularSepDeg(0, 60, 2, 60)).toBeCloseTo(1, 2);
  });

  it("wraps across RA 0/360", () => {
    expect(angularSepDeg(359.5, 0, 0.5, 0)).toBeCloseTo(1, 6);
  });
});

describe("findNearest", () => {
  const places = [place("far", 100, 0), place("near", 11, 41), place("mid", 20, 41)];

  it("picks the closest place", () => {
    const n = findNearest(10.7, 41.3, places);
    expect(n?.place.name).toBe("near");
    expect(n?.sep_deg).toBeLessThan(0.5);
  });

  it("keeps the earlier entry on a tie", () => {
    const n = findNearest(5, 5, [place("first", 5, 6), place("second", 5, 4)]);
    expect(n?.place.name).toBe("first");
  });

  it("returns null with no places", () => {
    expect(findNearest(0, 0, [])).toBeNull();
  });
});
