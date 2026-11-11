import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import objectsData from "@/data/objects.json";
import { api } from "@/lib/api";
import type { CatalogObject } from "@/lib/catalogTypes";
import type { EnginePayload, NavData } from "@/lib/types";
import { buddyItem } from "./items";
import { Targets } from "./Targets";

vi.mock("@/lib/api", () => ({ api: { setGoto: vi.fn() } }));

const objects = objectsData as CatalogObject[];
const setGoto = vi.mocked(api.setGoto);

// Chennai on a dark night, so the Tonight list is populated.
const CHENNAI = { latitude: 13.0878, longitude: 80.2785 };
const NIGHT = new Date("2026-10-10T16:00:00Z");

function payload(over: { nav?: NavData | null; location?: boolean } = {}): EnginePayload {
  return {
    nav: over.nav ?? null,
    location:
      over.location === false
        ? { latitude: null, longitude: null, source: null }
        : { ...CHENNAI, source: "manual" },
  } as unknown as EnginePayload;
}

function navAt(ra: number, dec: number): NavData {
  return { active: true, target_name: null, target_ra_deg: ra, target_dec_deg: dec } as NavData;
}

function firstGoButton() {
  return screen.getAllByRole("button", { name: /^Go to / })[0];
}

function objectFor(button: HTMLElement): CatalogObject {
  const name = button.getAttribute("aria-label")!.replace(/^Go to /, "");
  return objects.find((o) => o.name === name)!;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NIGHT);
  window.localStorage.clear();
  setGoto.mockReset();
  setGoto.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Targets / Tonight", () => {
  it("lists objects above the horizon, each with a Go to button", () => {
    render(<Targets state={payload()} />);
    expect(screen.getByRole("heading", { name: "Targets" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Go to / }).length).toBeGreaterThan(5);
  });

  it("Go to on a row sets that object's coordinates without opening the sheet", async () => {
    const onTargetSet = vi.fn();
    render(<Targets state={payload()} onTargetSet={onTargetSet} />);
    const button = firstGoButton();
    const item = buddyItem(objectFor(button))!;

    fireEvent.click(button);

    await waitFor(() => expect(onTargetSet).toHaveBeenCalledTimes(1));
    expect(setGoto).toHaveBeenCalledTimes(1);
    expect(setGoto).toHaveBeenCalledWith(item.ra_deg, item.dec_deg);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tapping the row body opens the detail sheet, whose Go to sets the target and closes it", async () => {
    render(<Targets state={payload()} />);
    const obj = objectFor(firstGoButton());
    const item = buddyItem(obj)!;

    fireEvent.click(screen.getByRole("button", { name: new RegExp(obj.designation.replace(/[()]/g, "\\$&")) }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(obj.name)).toBeInTheDocument();
    expect(setGoto).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Go to" }));
    await waitFor(() => expect(setGoto).toHaveBeenCalledWith(item.ra_deg, item.dec_deg));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("marks the row of the active target", () => {
    const first = objectFor(
      (render(<Targets state={payload()} />), firstGoButton()),
    );
    cleanup();
    const item = buddyItem(first)!;
    render(<Targets state={payload({ nav: navAt(item.ra_deg, item.dec_deg) })} />);

    const marked = screen.getByRole("button", { name: `${first.name}, current target` });
    expect(marked).toHaveTextContent("Target");
    expect(marked.closest("li")).toHaveAttribute("aria-current", "true");
    // Only that row is marked.
    expect(document.querySelectorAll("li[aria-current]")).toHaveLength(1);
  });

  it("shows a failure to set the target instead of swallowing it", async () => {
    setGoto.mockRejectedValue(new Error("POST /api/goto/set → 500: boom"));
    const onTargetSet = vi.fn();
    render(<Targets state={payload()} onTargetSet={onTargetSet} />);
    fireEvent.click(firstGoButton());
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
    expect(onTargetSet).not.toHaveBeenCalled();
  });

  it("asks for a location when none is known", () => {
    render(<Targets state={payload({ location: false })} />);
    expect(screen.getByText("Set your location")).toBeInTheDocument();
  });
});

describe("Targets / Search and Manual", () => {
  it("remembers the chosen segment", () => {
    render(<Targets state={payload()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Manual" }));
    expect(window.localStorage.getItem("pushnav.targets.tab")).toBe("manual");
    cleanup();
    render(<Targets state={payload()} />);
    expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
  });

  it("finds an NGC object and goes to it from its row", async () => {
    window.localStorage.setItem("pushnav.targets.tab", "search");
    render(<Targets state={payload()} />);
    const input = await screen.findByPlaceholderText(/M31/);
    fireEvent.change(input, { target: { value: "M31" } });
    const go = await screen.findByRole("button", { name: /^Go to .*NGC 224|^Go to M 31|^Go to Andromeda/ });
    fireEvent.click(go);
    await waitFor(() => expect(setGoto).toHaveBeenCalledTimes(1));
    const [ra, dec] = setGoto.mock.calls[0];
    expect(ra).toBeCloseTo(10.68, 1);
    expect(dec).toBeCloseTo(41.27, 1);
  });

  it("shows an empty state with no query", async () => {
    window.localStorage.setItem("pushnav.targets.tab", "search");
    render(<Targets state={payload()} />);
    expect(await screen.findByText("Search the sky")).toBeInTheDocument();
  });

  it("paginates search results with Show more", async () => {
    window.localStorage.setItem("pushnav.targets.tab", "search");
    render(<Targets state={payload()} />);
    fireEvent.change(await screen.findByPlaceholderText(/M31/), { target: { value: "NGC" } });
    const more = await screen.findByRole("button", { name: /^Show more/ });
    const before = screen.getAllByRole("button", { name: /^Go to / }).length;
    fireEvent.click(more);
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^Go to / }).length).toBeGreaterThan(before),
    );
  });

  it("validates manual coordinates and sets valid ones", async () => {
    window.localStorage.setItem("pushnav.targets.tab", "manual");
    render(<Targets state={payload()} />);
    fireEvent.click(screen.getByRole("button", { name: "Go to" }));
    expect(screen.getAllByText(/Enter (RA|Dec)/)).toHaveLength(2);
    expect(setGoto).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Right ascension/), { target: { value: "05h 35m 17s" } });
    fireEvent.change(screen.getByLabelText(/Declination/), { target: { value: "-05° 23' 28\"" } });
    fireEvent.click(screen.getByRole("button", { name: "Go to" }));
    await waitFor(() => expect(setGoto).toHaveBeenCalledTimes(1));
    const [ra, dec] = setGoto.mock.calls[0];
    expect(ra).toBeCloseTo((5 + 35 / 60 + 17 / 3600) * 15, 5);
    expect(dec).toBeCloseTo(-(5 + 23 / 60 + 28 / 3600), 5);
  });
});
