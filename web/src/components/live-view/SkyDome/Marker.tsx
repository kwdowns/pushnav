import * as THREE from "three";
import { Billboard, Html } from "@react-three/drei";
import { LABEL_Z_INDEX_RANGE } from "./constants";

const RADIUS = 2;

function altAzTo3D(altDeg: number, azDeg: number, radius: number) {
  const alt = altDeg * (Math.PI / 180);
  const az = -azDeg * (Math.PI / 180);
  return new THREE.Vector3(
    radius * Math.cos(alt) * Math.sin(az),
    radius * Math.sin(alt),
    radius * Math.cos(alt) * Math.cos(az),
  );
}

interface MarkerProps {
  altDeg: number;
  azDeg: number;
  color: string;
  label?: string;
  size?: number;
  /** Hollow ring (target) instead of a solid dot (pointing). */
  hollow?: boolean;
}

export function Marker({ altDeg, azDeg, color, label, size = 0.06, hollow = false }: MarkerProps) {
  if (altDeg < 0) return null;
  const pos = altAzTo3D(altDeg, azDeg, RADIUS);

  return (
    <group position={[pos.x, pos.y, pos.z]}>
      {hollow ? (
        // Always faces the camera so the ring reads as a ring from any angle.
        <Billboard>
          <mesh>
            <ringGeometry args={[size * 1.4, size * 2, 32]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
        </Billboard>
      ) : (
        <mesh>
          <sphereGeometry args={[size, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {label && (
        <Html
          position={[0, size * 2 + 0.05, 0]}
          center
          pointerEvents="none"
          zIndexRange={LABEL_Z_INDEX_RANGE}
        >
          <div
            style={{
              color,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              transform: "translateY(-100%)",
              textShadow: "0 0 4px rgb(0 0 0 / 80%)",
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}
