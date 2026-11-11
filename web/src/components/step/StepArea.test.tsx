import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepArea } from "./StepArea";
import { payload } from "@/lib/testPayload";
import type { ControlDescriptor } from "@/lib/types";

const controls: ControlDescriptor[] = [
  { id: "exposure", label: "Exposure", min: 1, max: 5000, step: 1, cur: 1000, unit: "100us" },
  { id: "gain", label: "Gain", min: 0, max: 100, step: 1, cur: 40 },
];

function section(container: HTMLElement) {
  return container.querySelector("[data-section]")?.getAttribute("data-section");
}

describe("StepArea", () => {
  it("SETUP: progress, open sliders and a Next action", () => {
    const { container } = render(<StepArea state={payload({ controls })} />);
    expect(section(container)).toBe("setup");
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/small, sharp dots/i)).toBeInTheDocument();
    expect(screen.getByText("Exposure")).toBeInTheDocument();
    expect(screen.getByText("Gain")).toBeInTheDocument();
    expect(screen.getByText("100 ms")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next$/i })).toBeEnabled();
  });

  it("SETUP without a camera: Next is disabled and a retry is offered", () => {
    render(<StepArea state={payload({ camera: { ...payload().camera, connected: false } })} />);
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("SYNC: Sync action, previous calibration when there is one", () => {
    render(<StepArea state={payload({ state: "SYNC", has_calibration: true })} />);
    expect(screen.getByText(/Pick any bright star/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sync$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use previous calibration/i })).toBeInTheDocument();
  });

  it("SYNC_CONFIRM: candidate rows, Confirm and Re-solve", () => {
    const sync = {
      in_progress: false,
      selected_idx: 4,
      error: null,
      candidates: [
        { idx: 4, name: "Vega", ra_deg: 279, dec_deg: 38, magnitude: 0, pixel_x: 1, pixel_y: 1 },
        { idx: 7, name: "Deneb", ra_deg: 310, dec_deg: 45, magnitude: 1.3, pixel_x: 2, pixel_y: 2 },
      ],
    };
    render(<StepArea state={payload({ state: "SYNC_CONFIRM", sync })} />);
    expect(screen.getByRole("button", { name: /Vega/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-solve/i })).toBeInTheDocument();
  });

  it("TRACKING: target readout, camera and sky view folded away", () => {
    const nav = {
      active: true, target_name: "M 31", target_ra_deg: 10.68, target_dec_deg: 41.27,
      separation_deg: 3.21, direction_text: "Push up and left", in_fov: false,
      pixel_x: null, pixel_y: null, camera_angle_deg: null,
      edge_x: null, edge_y: null, edge_angle_deg: null,
    };
    const { container } = render(
      <StepArea
        state={payload({
          state: "TRACKING",
          controls,
          nav,
          pointing: { ...payload().pointing, valid: true, ra_deg: 10, dec_deg: 40, solve_age_s: 0.2 },
        })}
      />,
    );
    expect(section(container)).toBe("tracking");
    expect(screen.getByText("M 31")).toBeInTheDocument();
    expect(screen.getByText("3.2°")).toBeInTheDocument();
    expect(screen.getByText("Push up and left")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
    expect(screen.queryByText(/Step \d of 4/)).not.toBeInTheDocument();
    // Collapsed: headers present, sliders not rendered.
    expect(screen.getByRole("button", { name: /camera/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /sky view/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Exposure")).not.toBeInTheDocument();
    expect(screen.getByText("100 ms · 40")).toBeInTheDocument(); // summary
  });

  it("TRACKING without a target points at the list", () => {
    render(<StepArea state={payload({ state: "TRACKING" })} />);
    expect(screen.getByText("No target")).toBeInTheDocument();
  });

  it("ERROR: camera lost with a retry, no restart", () => {
    const { container } = render(<StepArea state={payload({ state: "ERROR" })} />);
    expect(section(container)).toBe("camera-trouble");
    expect(screen.getByText(/Camera lost/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/restart/i)).not.toBeInTheDocument();
  });

  it("RECONNECTING: says so", () => {
    render(<StepArea state={payload({ state: "RECONNECTING" })} />);
    expect(screen.getByText(/Reconnecting to the camera/i)).toBeInTheDocument();
  });
});
