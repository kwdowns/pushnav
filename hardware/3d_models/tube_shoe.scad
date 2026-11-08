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
// PushNav Tube Shoe — a second finder shoe for the telescope tube
// ============================================================
//
// For scopes whose only finder shoe is taken by the finder. A female
// dovetail shoe, made to take the dovetail rail of the camera mounts
// (housing_v3 low mount, housing_v4 Pi mount), with its base curved to
// the tube. It sticks on with 3M VHB foam tape — no drilling. The foam
// takes up a millimetre or two of curvature mismatch, so the tube's
// diameter only needs to be roughly right.
//
// The rail slides in from the open end until it hits the stop, so the
// camera goes back to the same place each night. Two M4 thumbscrews in
// the side wall press it against the far flank.
//
// Default tube: Apertura AD8. MEASURE YOUR TUBE: wrap a strip of paper
// round it, mark the overlap, and set tube_od = circumference / π.
//
// HARDWARE:
//   2 × M4 × 6 heat-set inserts (5.9 mm knurl — the same as the
//   camera housing's), 2 × M4 × 16 thumbscrews (nylon-tipped if you can
//   get them), and a strip of 3M VHB tape (e.g. 5952, 1.1 mm) about
//   50 × 45 mm. Clean the tube with isopropyl alcohol first, press hard
//   for 30 s, and leave it a day before loading it.
//
// Where to stick it: along the tube (the open end toward the
// eyepiece end, so the camera points where the tube points), somewhere
// the camera's view isn't blocked by the focuser or finder and it
// doesn't foul the rocker box when the tube is pointed at the zenith.
//
// PRINTING: stands on its stop end (add a 5 mm brim), so every face is a vertical wall —
// no supports. PETG preferred (PLA can creep in a hot car).

$fn = 180;

// ============================================================
// DIMENSIONS — all values in millimeters
// ============================================================

/* Telescope tube */
tube_od               = 237;     // Apertura AD8: measured 744 mm round / π

/* Camera mount rail (housing_v3.scad: dovetail_*) */
rail_bottom_width     = 33;      // wide face, sits on the shoe floor
rail_top_width        = 20;      // narrow face, at rail_height
rail_height           = 11;
rail_length           = 39;

/* Shoe */
fit_clearance         = 0.3;     // per side, horizontally
channel_depth         = 9;       // shoe walls stop below the rail's narrow face
floor_thickness       = 3;       // at the centre line (more toward the edges)
shoe_width            = 52;
channel_length        = 45;      // rail_length + room to slide
stop_thickness        = 4;       // closed end the rail stops against

/* Thumbscrews — M4 heat-set inserts in the +Y wall */
insert_hole_dia       = 5.9;
insert_lead_in        = 0.6;
insert_hole_depth     = 6.5;
screw_clear_dia       = 4.5;
screw_x               = [-12, 12];   // from the channel's centre

// ============================================================
// DERIVED
// ============================================================

tube_r      = tube_od / 2;
shoe_length = channel_length + stop_thickness;
top_z       = floor_thickness + channel_depth;
edge_sag    = tube_r - sqrt(tube_r * tube_r - (shoe_width / 2) * (shoe_width / 2));
screw_z     = floor_thickness + channel_depth / 2;

function rail_half(d) = rail_bottom_width / 2
                      - (rail_bottom_width - rail_top_width) / 2 * d / rail_height;
channel_half_bottom = rail_half(0) + fit_clearance;
channel_half_top    = rail_half(channel_depth) + fit_clearance;
wall_at_screw       = shoe_width / 2 - (rail_half(channel_depth / 2) + fit_clearance);

assert(channel_depth < rail_height - 1, "walls would reach the mount's bridge");
assert(wall_at_screw > insert_hole_depth + 2, "side wall too thin for the inserts");
assert(screw_z + insert_hole_dia / 2 + 1 <= top_z, "insert too close to the top");
assert(channel_length >= rail_length + 2, "channel shorter than the rail");

// ============================================================
// MODEL — X along the tube, Y across it, Z away from the tube.
// The tube's top line is at Z = 0; the stop is at X = 0.
// ============================================================

module tube_shoe() {
    difference() {
        // Body: a block, less the tube
        translate([0, -shoe_width / 2, -edge_sag - 1])
            cube([shoe_length, shoe_width, top_z + edge_sag + 1]);

        translate([-1, 0, -tube_r])
            rotate([0, 90, 0])
                cylinder(r = tube_r, h = shoe_length + 2);

        // Dovetail channel, open at X = shoe_length
        translate([stop_thickness, 0, 0])
            rotate([90, 0, 90])
                linear_extrude(channel_length + 1)
                    polygon([
                        [-channel_half_bottom, floor_thickness],
                        [ channel_half_bottom, floor_thickness],
                        [ channel_half_top,    top_z + 0.01],
                        [ channel_half_top,    top_z + 1],
                        [-channel_half_top,    top_z + 1],
                        [-channel_half_top,    top_z + 0.01],
                    ]);

        // Thumbscrew inserts, from the +Y face
        for (sx = screw_x)
            translate([stop_thickness + channel_length / 2 + sx,
                       shoe_width / 2, screw_z])
                rotate([90, 0, 0]) {
                    translate([0, 0, -1])
                        cylinder(d = insert_hole_dia + 2 * insert_lead_in, h = 1.01, $fn = 48);
                    cylinder(d1 = insert_hole_dia + 2 * insert_lead_in,
                             d2 = insert_hole_dia, h = insert_lead_in, $fn = 48);
                    cylinder(d = insert_hole_dia, h = insert_hole_depth, $fn = 48);
                    cylinder(d = screw_clear_dia, h = shoe_width, $fn = 32);
                }
    }
}

// Print orientation: standing on the stop end
rotate([0, -90, 0]) tube_shoe();     // X (along the tube) becomes Z; stop end at Z = 0
