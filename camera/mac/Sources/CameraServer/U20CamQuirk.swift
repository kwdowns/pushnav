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

// U20CamQuirk.swift — runtime gain and frame length for the Innomaker
// U20CAM-9281M (0C45:636D).
//
// Same as the Windows and Linux servers (camera/windows/camera_server.c has
// the full explanation). The Sonix SN9C286 firmware never sends the UVC gain
// to the OV9281 and caps exposure at one stock frame. Through the vendor
// extension unit (unit 3, selector 1 = XDATA read/write):
//  - gain: write RAM 0x08F0:0x08F1 = gain x 512 (big-endian). The firmware
//    resets it on each exposure change, so maintain() re-applies it.
//  - exposure: raise the sensor frame length (VTS, 0x380E/0x380F) to the
//    firmware's exposure lines (RAM 0x0C41:0x0C42) via the bridge's I2C
//    controller (0x8600). Real exposure is ~2x the UVC value, reported to
//    the UI as display_scale 2.
// Volatile: unplugging restores stock. NEVER write 0x8E00-0x8EFF (the SPI
// flash controller) or use the flash selector (3).

import Foundation

final class U20CamQuirk {
    static let vendorID = 0x0C45
    static let productID = 0x636D

    static let gainMin = 10         // gain control unit: tenths of x (1.0x)
    static let gainMax = 155        // 15.5x
    static let gainStock = 20       // firmware default, 2.0x
    private static let vtsStock = 910
    private static let vtsMargin = 32
    private static let vtsMax = 9200        // ~1.0 s frames, under the 2 s watchdog
    private static let tickMs = 500
    private static let vtsRefreshTicks = 20 // re-send VTS every 10 s (no read-back)

    private let uvc: UVCController
    private let queue = DispatchQueue(label: "com.evf.camera.u20cam")
    private var timer: DispatchSourceTimer?
    private var gain = U20CamQuirk.gainStock
    private var vts = 0             // last frame length written; 0 = none
    private var vtsRepeat = false
    private var ticksSinceVts = 0

    /// Returns nil unless `uvc` is a U20CAM whose extension unit answers.
    init?(uvc: UVCController) {
        guard uvc.vendorID == U20CamQuirk.vendorID, uvc.productID == U20CamQuirk.productID else {
            return nil
        }
        self.uvc = uvc
        guard read(0x08F0) != nil else {
            fputs("U20CAM: extension unit not reachable, using stock controls\n", stderr)
            return nil
        }
        print("U20CAM quirk active: gain \(U20CamQuirk.gainMin)..\(U20CamQuirk.gainMax) (x0.1), "
              + "frame length follows exposure (max \(U20CamQuirk.vtsMax) lines)")
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + .milliseconds(U20CamQuirk.tickMs),
                   repeating: .milliseconds(U20CamQuirk.tickMs))
        t.setEventHandler { [weak self] in self?.maintain() }
        t.resume()
        timer = t
    }

    deinit {
        timer?.cancel()
    }

    var currentGain: Int {
        return queue.sync { gain }
    }

    func setGain(_ value: Int) {
        queue.sync {
            gain = Swift.min(Swift.max(value, U20CamQuirk.gainMin), U20CamQuirk.gainMax)
            _ = applyGain()
        }
    }

    // MARK: - XDATA access (call on `queue`, except from init)

    /// SET [lo, hi, 0, 0xFF] latches the address; GET returns [lo, hi, value, 0].
    private func read(_ addr: Int) -> Int? {
        var d: [UInt8] = [UInt8(addr & 0xFF), UInt8((addr >> 8) & 0xFF), 0x00, 0xFF]
        guard uvc.xuTransfer(set: true, &d) else { return nil }
        d = [0, 0, 0, 0]
        guard uvc.xuTransfer(set: false, &d),
              d[0] == UInt8(addr & 0xFF), d[1] == UInt8((addr >> 8) & 0xFF) else { return nil }
        return Int(d[2])
    }

    private static func writeAllowed(_ addr: Int) -> Bool {
        return addr == 0x08F0 || addr == 0x08F1           // gain (firmware RAM)
            || (0x8602...0x8604).contains(addr)           // I2C data
            || addr == 0x860A                             // I2C command
    }

    /// SET [lo, hi, value, 0x00].
    private func write(_ addr: Int, _ val: Int) -> Bool {
        guard U20CamQuirk.writeAllowed(addr) else { return false }
        var d: [UInt8] = [UInt8(addr & 0xFF), UInt8((addr >> 8) & 0xFF), UInt8(val & 0xFF), 0x00]
        return uvc.xuTransfer(set: true, &d)
    }

    /// Write one OV9281 register through the bridge's I2C controller, then
    /// check its data registers still hold our bytes (the firmware shares
    /// the controller) and retry if not.
    private func sensorWrite(_ reg: Int, _ val: Int) -> Bool {
        for _ in 0..<3 {
            guard write(0x8602, reg >> 8), write(0x8603, reg & 0xFF),
                  write(0x8604, val & 0xFF), write(0x860A, 0x51) else { return false }
            var done = false
            for _ in 0..<20 where !done {
                if let cmd = read(0x860A), let st = read(0x8600) {
                    done = (cmd & 0x01) == 0 && (st & 0x40) != 0 && (st & 0x80) == 0
                }
            }
            if done, read(0x8602) == reg >> 8, read(0x8603) == reg & 0xFF,
               read(0x8604) == val & 0xFF {
                return true
            }
        }
        return false
    }

    private static func gainWord(_ x10: Int) -> Int {
        return (x10 * 512 + 5) / 10                       // 10 -> 0x0200 (1x)
    }

    private func applyGain() -> Bool {
        let w = U20CamQuirk.gainWord(gain)
        return write(0x08F0, w >> 8) && write(0x08F1, w & 0xFF)
    }

    /// Timer tick: re-apply gain, fit the frame length to the exposure.
    private func maintain() {
        if let hi = read(0x08F0), let lo = read(0x08F1),
           (hi << 8 | lo) != U20CamQuirk.gainWord(gain) {
            _ = applyGain()
        }

        guard let hi = read(0x0C41), let lo = read(0x0C42) else { return }
        let lines = hi << 8 | lo
        let target = Swift.min(Swift.max(lines + U20CamQuirk.vtsMargin, U20CamQuirk.vtsStock),
                               U20CamQuirk.vtsMax)
        ticksSinceVts += 1
        if target == vts && !vtsRepeat && ticksSinceVts < U20CamQuirk.vtsRefreshTicks { return }
        if sensorWrite(0x380E, target >> 8) && sensorWrite(0x380F, target & 0xFF) {
            if target != vts {
                print("U20CAM: frame length \(target) lines (exposure \(lines) lines)")
            }
            vtsRepeat = (target != vts)
            vts = target
            ticksSinceVts = 0
        }
    }
}
