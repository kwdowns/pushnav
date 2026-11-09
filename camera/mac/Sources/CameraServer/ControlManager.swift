// Copyright (C) 2026 Arun Venkataswamy
//
// This file is part of PushNav.
//
// PushNav is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// PushNav is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with PushNav. If not, see <https://www.gnu.org/licenses/>.

// ControlManager.swift — Maps protocol control IDs to UVC operations.
//
// Thin mapping layer that builds CONTROL_INFO JSON from probed UVC ranges
// and dispatches SET_CONTROL commands to the appropriate UVC accessors.

import Foundation

class ControlManager {
    private let uvc: UVCController
    private let u20: U20CamQuirk?     // Innomaker U20CAM: gain via firmware RAM

    init(uvc: UVCController, u20: U20CamQuirk? = nil) {
        self.uvc = uvc
        self.u20 = u20
    }

    /// Build the CONTROL_INFO JSON dictionary from current UVC state.
    func buildControlInfo() -> [String: Any] {
        var controls: [[String: Any]] = []

        if uvc.exposureTimeRange.capable {
            let curExposure = uvc.getExposureTime()
            var exposure: [String: Any] = [
                "id": "exposure",
                "label": "Exposure",
                "type": "int",
                "min": uvc.exposureTimeRange.min,
                "max": uvc.exposureTimeRange.max,
                "step": uvc.exposureTimeRange.res,
                "cur": curExposure,
                "unit": "100us",
            ]
            if u20 != nil {
                exposure["display_scale"] = 2   // U20CAM: real exposure ~2x the UVC value
            }
            controls.append(exposure)
        }

        if let u20 = u20 {
            controls.append([
                "id": "gain",
                "label": "Gain",
                "type": "int",
                "min": U20CamQuirk.gainMin,
                "max": U20CamQuirk.gainMax,
                "step": 1,
                "cur": u20.currentGain,
                "unit": "x10",                  // tenths of x (real gain)
            ])
        } else if uvc.gainRange.capable {
            let curGain = uvc.getGain()
            controls.append([
                "id": "gain",
                "label": "Gain",
                "type": "int",
                "min": uvc.gainRange.min,
                "max": uvc.gainRange.max,
                "step": uvc.gainRange.res,
                "cur": curGain,
                "unit": "raw",
            ])
        }

        return ["controls": controls]
    }

    /// Apply a SET_CONTROL command. Returns true if the control was recognized and applied.
    func applySetControl(id: String, value: Int) -> Bool {
        switch id {
        case "exposure":
            uvc.setExposureTime(value)
            print("SET_CONTROL: exposure = \(value) → actual = \(uvc.getExposureTime())")
            return true
        case "gain":
            if let u20 = u20 {
                u20.setGain(value)
                print("SET_CONTROL: gain = \(value) → actual = \(u20.currentGain) (x0.1)")
            } else {
                uvc.setGain(value)
                print("SET_CONTROL: gain = \(value) → actual = \(uvc.getGain())")
            }
            return true
        default:
            fputs("WARNING: Unknown control ID: \(id)\n", stderr)
            return false
        }
    }
}
