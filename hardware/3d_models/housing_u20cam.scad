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
// PushNav Camera Housing — Innomaker U20CAM-9281M (32 × 32 mm board)
// ============================================================
//
// The v3 housing, resized for the Innomaker U20CAM-9281M. Its board is
// 32 × 32 mm (v3's camera is 25 × 25 mm on a white base), has no base,
// and its USB lead plugs into a side-entry 1.25 mm 5-pin connector on
// the BACK of the board. So:
//
//   - the shell grows from 50 to 58 mm and the thread from 44 to 52 mm,
//     so the bigger pocket still fits inside the thread's root
//   - the board stands on four standoffs on its 28 mm hole square
//     (M2 screws), high enough to clear the connector underneath
//   - the lead leaves through a slot in the back wall at standoff
//     height; unplug it from the board, thread it through the slot,
//     then plug it back in
//
// Everything else comes from housing_v3.scad: the hood (same baffle and
// 1.25" cap band, wider thread), the printed cap, and the flat bottom
// with its M4 insert that turns on the v3 low mount's Ø30 seat. Print
// the mount from housing_v3.scad (stls/housing_v3_mount.stl) — it is
// unchanged.
//
// HARDWARE:
//   4 × M2 × 6 screws (self-tapping, or machine screws that cut their
//   own thread in the 1.7 mm holes), plus v3's M4 × 20 star knob and
//   M4 × 6 heat-set insert (5.9 mm knurl).
//
// MEASURE BEFORE PRINTING — vendor drawing gives the board outline and
// holes only. Check with calipers and adjust if needed:
//   pcb_standoff_height — must exceed the tallest part on the board's
//                         back, normally the plugged-in USB connector
//   pcb_thickness       — usually 1.6
//
// PRINTING:
//   Set one U20_RENDER_* flag true (others false), Render (F6), export.
//     - Base: bottom face on the bed, no supports (the cable slot roof
//       is a 12 mm bridge; the back flat ends in a 45° chamfer).
//     - Hood: lip-thread end on the bed, no supports.
//     - Cap:  closed top on the bed, no supports.

include <housing_v3.scad>

// ============================================================
// CONFIGURATION
// ============================================================

U20_RENDER_BASE = true;
U20_RENDER_HOOD = true;
U20_RENDER_CAP  = true;

// ============================================================
// OVERRIDES of housing_v3.scad values (OpenSCAD: last assignment wins)
// ============================================================

// Turn off v3's own render block — this file renders its own parts.
RENDER_MOUNT = false;
RENDER_BASE  = false;
RENDER_HOOD  = false;
RENDER_CAP   = false;

pcb_width       = 32;    // U20CAM-9281M board (vendor drawing)
base_outer_dia  = 58;    // was 50
lip_thread_dia  = 52;    // was 44; root ≈ 52 − 2 × 2.6 = 46.8
hood_flange_dia = 44;    // must stay ≤ the thread root (≈ 46.8)
back_flat_y     = 24;    // was 18 — the pocket is wider now

// ============================================================
// U20CAM DIMENSIONS — all values in millimeters
// ============================================================

pcb_hole_spacing    = 28;    // square hole pattern (vendor drawing)
pcb_thickness       = 1.6;   // MEASURE
pcb_standoff_height = 5;     // MEASURE — board back to floor; the 1.25 mm
                             // side-entry connector stands ~3.5 mm
standoff_dia        = 5;
m2_pilot_dia        = 1.7;   // M2 self-tap / thread-forming pilot
m2_pilot_depth      = 7;

u20_pocket_width    = 38;    // 32 board + 3 mm each side for the lead
u20_pocket_radius   = 9;     // corner fillet — keeps the pocket inside the
                             // thread root (√2 × (19 − 9) + 9 = 23.1 < 23.4)

cable_slot_width    = 12;    // passes the 1.25 mm 5-pin plug (~8 × 3.5)
cable_slot_top      = 12;    // slot runs from the floor to this Z

// ============================================================
// DERIVED
// ============================================================

u20_floor_z  = base_floor_thickness;                      // 5
pcb_bottom_z = u20_floor_z + pcb_standoff_height;         // 10
pcb_top_z    = pcb_bottom_z + pcb_thickness;              // 11.6
thread_root_dia = lip_thread_dia - 2 * lip_thread_pitch / (2 * tan(lip_tooth_angle));

assert(sqrt(2) * (u20_pocket_width / 2 - u20_pocket_radius) + u20_pocket_radius
           < thread_root_dia / 2,
       "pocket corners would reach past the thread root");
assert(sqrt(2) * (u20_pocket_width / 2 - u20_pocket_radius) + u20_pocket_radius
           > sqrt(2) * pcb_width / 2 - 1,
       "board corners would not clear the pocket fillets");
assert(hood_flange_dia <= thread_root_dia, "hood flange would overhang the thread");
assert(pcb_top_z < base_height, "board would stand above the housing top");
assert(cable_slot_top > pcb_bottom_z, "cable slot must reach the board's underside");
assert(u20_pocket_width / 2 + 3 <= back_flat_y, "back wall under 3 mm");

// ============================================================
// MODULES
// ============================================================

module u20_base() {
    difference() {
        union() {
            difference() {
                translate([0, 0, -base_extension])
                    cylinder(d = base_outer_dia, h = base_height + base_extension);

                // Pocket — floor to housing top
                hull()
                    for (x = [-1, 1], y = [-1, 1])
                        translate([x * (u20_pocket_width / 2 - u20_pocket_radius),
                                   y * (u20_pocket_width / 2 - u20_pocket_radius),
                                   u20_floor_z])
                            cylinder(r = u20_pocket_radius, h = base_height);
            }

            // Board standoffs on the 28 mm hole square
            for (x = [-1, 1], y = [-1, 1])
                translate([x * pcb_hole_spacing / 2, y * pcb_hole_spacing / 2,
                           u20_floor_z - 0.01])
                    cylinder(d = standoff_dia, h = pcb_standoff_height + 0.01);

            translate([0, 0, base_height])
                _threaded_lip();
        }

        // M2 pilots
        for (x = [-1, 1], y = [-1, 1])
            translate([x * pcb_hole_spacing / 2, y * pcb_hole_spacing / 2,
                       pcb_bottom_z - m2_pilot_depth])
                cylinder(d = m2_pilot_dia, h = m2_pilot_depth + 1, $fn = 24);

        // Cable slot through the back wall (+Y)
        translate([-cable_slot_width / 2, 0, u20_floor_z])
            cube([cable_slot_width, base_outer_dia, cable_slot_top - u20_floor_z]);

        // Back flat, ending in a 45° chamfer so it prints without supports
        flat_top = base_height - 1 - (base_outer_dia / 2 - back_flat_y);
        hull() {
            translate([-base_outer_dia, back_flat_y, -base_extension - 1])
                cube([2 * base_outer_dia, base_outer_dia,
                      flat_top + base_extension + 1]);
            translate([-base_outer_dia, base_outer_dia / 2, -base_extension - 1])
                cube([2 * base_outer_dia, base_outer_dia,
                      base_height - 1 + base_extension + 1]);
        }

        // Knob insert, from the bottom face
        translate([0, 0, -base_extension])
            _insert_pocket();
    }
}

// ============================================================
// RENDER
// ============================================================

u20_single = (U20_RENDER_BASE ? 1 : 0) + (U20_RENDER_HOOD ? 1 : 0)
           + (U20_RENDER_CAP ? 1 : 0) == 1;

if (u20_single) {
    if (U20_RENDER_BASE) translate([0, 0, base_extension]) u20_base();
    if (U20_RENDER_HOOD) hood();
    if (U20_RENDER_CAP)  translate([0, 0, cap_height]) rotate([180, 0, 0]) cap();
} else {
    u20_hood_z = base_height + preview_gap + explode;
    if (U20_RENDER_BASE) u20_base();
    if (U20_RENDER_HOOD) translate([0, 0, u20_hood_z]) hood();
    if (U20_RENDER_CAP)
        translate([0, 0, u20_hood_z + hood_top + preview_gap]) cap();
    // Board outline, preview only
    if ($preview && U20_RENDER_BASE)
        %translate([-pcb_width / 2, -pcb_width / 2, pcb_bottom_z])
            cube([pcb_width, pcb_width, pcb_thickness]);
}
