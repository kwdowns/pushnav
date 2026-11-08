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

// ============================================================
// PushNav Pi 4 / Pi 5 Tube Tray
// ============================================================
//
// An open tray that carries a Raspberry Pi 4 or 5 on the telescope
// tube, for PushNav headless. Its base is curved to the tube like the
// tube shoe (tube_shoe.scad), and it sticks on with 3M VHB tape; a
// 25 mm Velcro strap through the end slots and round the tube is
// optional insurance. Open sides keep every port reachable and let a
// Pi 5's Active Cooler breathe — use one on a Pi 5, which runs the
// solver continuously.
//
// The Pi's long edge runs along the tube. Mount it near the tube shoe
// so the camera's 1 m lead reaches without strain, and with the USB-C
// power side facing where your power bank lives.
//
// MEASURE YOUR TUBE: set tube_od = circumference / π (as tube_shoe).
//
// HARDWARE: 4 × M2.5 × 6 screws (self-tapping, or machine screws that
// cut their own thread in the 2.2 mm holes); VHB tape ~ 90 × 50 mm;
// optional 25 mm Velcro strap.
//
// PRINTING: base down, with TREE supports "on build plate only" — they
// are needed only under the shallow curved underside. PETG preferred.

$fn = 180;

/* Telescope tube */
tube_od          = 237;     // Apertura AD8: measured 744 mm round / π

/* Raspberry Pi 4 / 5 — same board outline and hole pattern */
pi_length        = 85;
pi_width         = 56;
pi_hole_x        = [3.5, 61.5];   // from the board's corner
pi_hole_y        = [3.5, 52.5];

/* Tray */
margin           = 5;       // plate beyond the board, each side (Y)
floor_thickness  = 3;       // at the centre line
standoff_height  = 6;       // clears the microSD and the Pi 4's underside parts
standoff_dia     = 6;
pilot_dia        = 2.2;     // M2.5 self-tap
pilot_depth      = 7;
strap_width      = 27;      // slot for a 25 mm strap
strap_slot       = 4;       // slot size along the tube
strap_end        = 4;       // plate beyond each slot

// ============================================================
// DERIVED
// ============================================================

tube_r      = tube_od / 2;
tray_width  = pi_width + 2 * margin;
tray_length = pi_length + 2 * (strap_end + strap_slot + 3);
edge_sag    = tube_r - sqrt(tube_r * tube_r - (tray_width / 2) * (tray_width / 2));

assert(strap_width < tray_width - 6, "strap slot too wide for the tray");

// X along the tube, Y across, Z away from it; tube top line at Z = 0
module pi45_tray() {
    difference() {
        union() {
            translate([-tray_length / 2, -tray_width / 2, -edge_sag - 1])
                _rounded_block(tray_length, tray_width,
                               floor_thickness + edge_sag + 1, 4);
            for (hx = pi_hole_x, hy = pi_hole_y)
                translate([hx - pi_length / 2, hy - pi_width / 2, floor_thickness - 0.01])
                    cylinder(d = standoff_dia, h = standoff_height + 0.01, $fn = 48);
        }

        // Tube
        translate([-tray_length, 0, -tube_r])
            rotate([0, 90, 0])
                cylinder(r = tube_r, h = 2 * tray_length);

        // Pilots
        for (hx = pi_hole_x, hy = pi_hole_y)
            translate([hx - pi_length / 2, hy - pi_width / 2,
                       floor_thickness + standoff_height - pilot_depth])
                cylinder(d = pilot_dia, h = pilot_depth + 1, $fn = 24);

        // Strap slots, one at each end
        for (s = [-1, 1])
            translate([s * (tray_length / 2 - strap_end - strap_slot / 2) - strap_slot / 2,
                       -strap_width / 2, -edge_sag - 2])
                cube([strap_slot, strap_width, floor_thickness + edge_sag + 4]);
    }
}

module _rounded_block(l, w, h, r) {
    hull()
        for (x = [r, l - r], y = [r, w - r])
            translate([x, y, 0]) cylinder(r = r, h = h, $fn = 32);
}

// Print orientation: lowest point (the curved edges) on the bed
translate([0, 0, edge_sag]) pi45_tray();

// Board outline, preview only
if ($preview)
    %translate([-pi_length / 2, -pi_width / 2,
                edge_sag + floor_thickness + standoff_height])
        cube([pi_length, pi_width, 1.6]);
