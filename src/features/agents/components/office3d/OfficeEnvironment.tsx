import { useRef, useEffect } from "react";
import { Box, Plane, Cylinder, Sphere, Html, Text } from "@react-three/drei";
import { StatsBar } from "@/features/agents/components/dashboard";
import { ActivityFeed, type ActivityEntry } from "@/features/agents/components/dashboard";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";

/* ─── Nordic palette ───────────────────────────────────────── */
const PALETTE = {
  floor: "#e8dfd4",        // warm light oak
  floorAlt: "#d4c8b8",     // subtle plank variation
  wall: "#f2ede8",         // warm off-white
  wallAccent: "#e5ddd3",   // slightly darker trim
  ceiling: "#f5f1ec",      // soft white
  woodLight: "#c9a96e",    // birch / pine
  woodMid: "#a3824a",      // medium oak
  woodDark: "#7a5c36",     // walnut accent
  fabric: "#8b9a8e",       // sage green upholstery
  fabricAlt: "#a3a89e",    // warm grey linen
  metal: "#6b6b6b",        // matte black metal
  metalLight: "#9a9a9a",   // brushed steel
  white: "#fefcf9",        // paper white
  plant: "#4a7c59",        // deep green
  plantLight: "#6b9e6e",   // lighter leaf
  monitor: "#1a1a24",      // dark screen
  screenGlow: "#d4e4f7",   // cool white screen
};

type Vec3 = [number, number, number];
type PlantSize = "small" | "medium" | "tall";

/**
 * Keep a clean center sightline toward the whiteboard.
 * Decorative props should not be placed in this lane.
 */
const WHITEBOARD_NO_PROP_ZONE = {
  minX: -3.2,
  maxX: 3.2,
  minZ: 1.8,
  maxZ: 8.0,
} as const;

const resolveNoPropZonePosition = (
  position: Vec3,
  footprint: { xRadius: number; zRadius: number },
  padding = 0.35,
): Vec3 => {
  const [x, y, z] = position;
  const zone = WHITEBOARD_NO_PROP_ZONE;
  const overlapsX = x + footprint.xRadius > zone.minX && x - footprint.xRadius < zone.maxX;
  const overlapsZ = z + footprint.zRadius > zone.minZ && z - footprint.zRadius < zone.maxZ;
  if (!overlapsX || !overlapsZ) return position;

  const leftX = zone.minX - footprint.xRadius - padding;
  const rightX = zone.maxX + footprint.xRadius + padding;
  const shiftedX = Math.abs(x - leftX) <= Math.abs(x - rightX) ? leftX : rightX;
  return [shiftedX, y, z];
};

const getPlantFootprint = (size: PlantSize) => {
  if (size === "tall") return { xRadius: 0.65, zRadius: 0.65 };
  if (size === "medium") return { xRadius: 0.48, zRadius: 0.48 };
  return { xRadius: 0.3, zRadius: 0.3 };
};

/* ─── helpers ──────────────────────────────────────────────── */

/** Pendant lamp — hanging from ceiling */
const PendantLamp = ({
  position,
  color = "#f5e6c8",
}: {
  position: [number, number, number];
  color?: string;
}) => (
  <group position={position}>
    {/* cord */}
    <Cylinder args={[0.01, 0.01, 2, 4]} position={[0, 1, 0]}>
      <meshStandardMaterial color={PALETTE.metal} />
    </Cylinder>
    {/* shade — wide shallow dome */}
    <Cylinder args={[0.6, 0.15, 0.3, 16]} position={[0, 0, 0]}>
      <meshStandardMaterial color={PALETTE.woodLight} roughness={0.7} />
    </Cylinder>
    {/* bulb glow */}
    <Sphere args={[0.12, 8, 8]} position={[0, -0.1, 0]}>
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.6}
        toneMapped={false}
      />
    </Sphere>
    <pointLight position={[0, -0.2, 0]} intensity={0.6} color={color} distance={8} />
  </group>
);

/** Distinct monitor accent colors — nice saturated palette */
export const MONITOR_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ef4444", // red
  "#22c55e", // green
];

export type DeskAgentInfo = {
  name: string;
  status: "working" | "idle";
  outputLineCount: number;
  color: string;
  monitorColor?: string;
};

/** Nordic desk — light wood top, angled legs */
const Workstation = ({
  position,
  rotation = [0, 0, 0],
  agent,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  agent?: DeskAgentInfo;
}) => {
  const screenColor = agent?.monitorColor ?? PALETTE.screenGlow;
  const isOccupied = !!agent;

  return (
    <group position={position} rotation={rotation}>
      {/* desk top — light birch */}
      <Box args={[3, 0.06, 1.3]} position={[0, 0.92, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.woodLight} roughness={0.65} />
      </Box>
      {/* angled legs — tapered */}
      {[
        { x: -1.3, z: -0.5, ry: 0.08 },
        { x: 1.3, z: -0.5, ry: -0.08 },
        { x: -1.3, z: 0.5, ry: 0.08 },
        { x: 1.3, z: 0.5, ry: -0.08 },
      ].map((leg, i) => (
        <Cylinder
          key={i}
          args={[0.035, 0.025, 0.92, 6]}
          position={[leg.x, 0.46, leg.z]}
          rotation={[0, 0, leg.ry]}
          castShadow
        >
          <meshStandardMaterial color={PALETTE.woodMid} roughness={0.6} />
        </Cylinder>
      ))}

      {/* monitor — pushed forward so stand is behind */}
      <Box args={[1.1, 0.65, 0.03]} position={[0, 1.5, -0.25]} castShadow>
        <meshStandardMaterial color={PALETTE.monitor} roughness={0.4} />
      </Box>
      {/* screen face — bright when claw is on desk */}
      <Box args={[1.0, 0.55, 0.005]} position={[0, 1.5, -0.232]}>
        <meshStandardMaterial
          color={isOccupied ? screenColor : "#111118"}
          emissive={isOccupied ? screenColor : "#000000"}
          emissiveIntensity={isOccupied ? 0.8 : 0}
        />
      </Box>

      {/* Monitor HUD — 3D text directly on screen */}
      {isOccupied && (
        <group position={[0, 1.5, -0.22]}>
          {/* dark background plane behind text */}
          <Plane args={[0.92, 0.48]} position={[0, 0, -0.001]}>
            <meshBasicMaterial color="#000000" transparent opacity={0.92} />
          </Plane>
          {/* Agent name */}
          <Text
            position={[0, 0.12, 0]}
            fontSize={0.12}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            maxWidth={0.85}
            overflowWrap="break-word"
            textAlign="center"
            fontWeight="bold"
          >
            {agent.name.toUpperCase()}
          </Text>
          {/* Status */}
          <Text
            position={[0, -0.04, 0]}
            fontSize={0.08}
            color={agent.status === "working" ? "#86efac" : "#fde047"}
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            {agent.status === "working" ? "● RUNNING" : "● IDLE"}
          </Text>
          {/* Output lines */}
          <Text
            position={[0, -0.16, 0]}
            fontSize={0.065}
            color="#cccccc"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            {`${agent.outputLineCount} lines`}
          </Text>
        </group>
      )}

      {/* screen glow light when occupied */}
      {isOccupied && (
        <pointLight
          position={[0, 1.5, -0.05]}
          intensity={0.4}
          color={screenColor}
          distance={2.5}
          decay={2}
        />
      )}

      {/* monitor stand — tucked behind the screen */}
      <Cylinder args={[0.03, 0.04, 0.35, 6]} position={[0, 1.13, -0.35]}>
        <meshStandardMaterial color={PALETTE.metalLight} metalness={0.6} roughness={0.3} />
      </Cylinder>
      <Cylinder args={[0.15, 0.15, 0.015, 12]} position={[0, 0.955, -0.35]}>
        <meshStandardMaterial color={PALETTE.metalLight} metalness={0.6} roughness={0.3} />
      </Cylinder>

      {/* keyboard hint */}
      <Box args={[0.5, 0.015, 0.18]} position={[0, 0.955, 0.1]}>
        <meshStandardMaterial color={PALETTE.fabricAlt} roughness={0.8} />
      </Box>

      {/* chair */}
    <group position={[0, 0, 1.1]}>
      {/* seat — rounded cushion */}
      <Box args={[0.52, 0.1, 0.48]} position={[0, 0.52, 0]} castShadow>
        <meshStandardMaterial color={PALETTE.fabric} roughness={0.75} />
      </Box>
      {/* backrest */}
      <Box args={[0.5, 0.45, 0.05]} position={[0, 0.8, -0.22]} castShadow>
        <meshStandardMaterial color={PALETTE.fabric} roughness={0.75} />
      </Box>
      {/* post */}
      <Cylinder args={[0.035, 0.035, 0.42, 6]} position={[0, 0.28, 0]}>
        <meshStandardMaterial color={PALETTE.metal} metalness={0.7} roughness={0.3} />
      </Cylinder>
      {/* base star */}
      {[0, 72, 144, 216, 288].map((deg, i) => (
        <Box
          key={i}
          args={[0.035, 0.03, 0.28]}
          position={[
            Math.sin((deg * Math.PI) / 180) * 0.14,
            0.035,
            Math.cos((deg * Math.PI) / 180) * 0.14,
          ]}
          rotation={[0, (deg * Math.PI) / 180, 0]}
        >
          <meshStandardMaterial color={PALETTE.metal} metalness={0.7} roughness={0.3} />
        </Box>
      ))}
    </group>
  </group>
  );
};

/** Side workstation variant — slimmer profile + shelf light for left/right walls */
const SideWorkstation = ({
  position,
  rotation = [0, 0, 0],
  agent,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  agent?: DeskAgentInfo;
}) => {
  const screenColor = agent?.monitorColor ?? "#cbd5e1";
  const isOccupied = !!agent;
  return (
    <group position={position} rotation={rotation}>
      {/* narrow standing desk top */}
      <Box args={[2.4, 0.06, 1.0]} position={[0, 0.94, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#bea06b" roughness={0.6} />
      </Box>
      {/* side legs */}
      {[-1.05, 1.05].map((x, i) => (
        <Cylinder key={i} args={[0.04, 0.03, 0.94, 7]} position={[x, 0.47, -0.32]} castShadow>
          <meshStandardMaterial color={PALETTE.woodDark} roughness={0.55} />
        </Cylinder>
      ))}
      {[-1.05, 1.05].map((x, i) => (
        <Cylinder key={`f-${i}`} args={[0.04, 0.03, 0.94, 7]} position={[x, 0.47, 0.32]} castShadow>
          <meshStandardMaterial color={PALETTE.woodDark} roughness={0.55} />
        </Cylinder>
      ))}

      {/* ── Monitor — matching front-desk style ── */}
      <Box args={[1.1, 0.65, 0.03]} position={[0, 1.5, -0.25]} castShadow>
        <meshStandardMaterial color={PALETTE.monitor} roughness={0.4} />
      </Box>
      {/* screen face */}
      <Box args={[1.0, 0.55, 0.005]} position={[0, 1.5, -0.232]}>
        <meshStandardMaterial
          color={isOccupied ? screenColor : "#111118"}
          emissive={isOccupied ? screenColor : "#000000"}
          emissiveIntensity={isOccupied ? 0.8 : 0}
        />
      </Box>

      {/* Monitor HUD — same as front desks */}
      {isOccupied && agent && (
        <group position={[0, 1.5, -0.22]}>
          <Plane args={[0.92, 0.48]} position={[0, 0, -0.001]}>
            <meshBasicMaterial color="#000000" transparent opacity={0.92} />
          </Plane>
          <Text
            position={[0, 0.12, 0]}
            fontSize={0.12}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            maxWidth={0.85}
            overflowWrap="break-word"
            textAlign="center"
            fontWeight="bold"
          >
            {agent.name.toUpperCase()}
          </Text>
          <Text
            position={[0, -0.04, 0]}
            fontSize={0.08}
            color={agent.status === "working" ? "#86efac" : "#fde047"}
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            {agent.status === "working" ? "● RUNNING" : "● IDLE"}
          </Text>
          <Text
            position={[0, -0.16, 0]}
            fontSize={0.065}
            color="#cccccc"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            {`${agent.outputLineCount} lines`}
          </Text>
        </group>
      )}

      {/* monitor stand */}
      <Cylinder args={[0.03, 0.04, 0.35, 6]} position={[0, 1.13, -0.35]}>
        <meshStandardMaterial color={PALETTE.metalLight} metalness={0.6} roughness={0.3} />
      </Cylinder>
      <Cylinder args={[0.15, 0.15, 0.015, 12]} position={[0, 0.955, -0.35]}>
        <meshStandardMaterial color={PALETTE.metalLight} metalness={0.6} roughness={0.3} />
      </Cylinder>

      {/* keyboard hint */}
      <Box args={[0.5, 0.015, 0.18]} position={[0, 0.955, 0.1]}>
        <meshStandardMaterial color={PALETTE.fabricAlt} roughness={0.8} />
      </Box>

      {/* screen glow light when occupied */}
      {isOccupied && (
        <pointLight position={[0, 1.5, -0.05]} intensity={0.4} color={screenColor} distance={2.5} decay={2} />
      )}

      {/* shelf */}
      <Box args={[1.4, 0.035, 0.2]} position={[0, 1.88, -0.34]}>
        <meshStandardMaterial color="#d4c4a8" roughness={0.68} />
      </Box>
      {/* shelf decor */}
      <Box args={[0.18, 0.24, 0.12]} position={[-0.48, 2.02, -0.34]}>
        <meshStandardMaterial color="#7a8b9a" roughness={0.72} />
      </Box>
      <Box args={[0.16, 0.2, 0.1]} position={[-0.28, 2.0, -0.34]}>
        <meshStandardMaterial color="#8b6b4a" roughness={0.72} />
      </Box>
      <Box args={[0.14, 0.16, 0.1]} position={[-0.10, 1.98, -0.34]}>
        <meshStandardMaterial color="#6f8a72" roughness={0.72} />
      </Box>
      <Cylinder args={[0.045, 0.045, 0.09, 10]} position={[0.22, 1.95, -0.34]}>
        <meshStandardMaterial color="#efe7da" roughness={0.9} />
      </Cylinder>
      <Sphere args={[0.05, 10, 10]} position={[0.45, 1.98, -0.34]}>
        <meshStandardMaterial color="#9aa7b2" roughness={0.35} metalness={0.2} />
      </Sphere>

      {/* chair — matching front-desk style */}
      <group position={[0, 0, 1.1]}>
        <Box args={[0.52, 0.1, 0.48]} position={[0, 0.52, 0]} castShadow>
          <meshStandardMaterial color={PALETTE.fabric} roughness={0.75} />
        </Box>
        <Box args={[0.5, 0.45, 0.05]} position={[0, 0.8, -0.22]} castShadow>
          <meshStandardMaterial color={PALETTE.fabric} roughness={0.75} />
        </Box>
        <Cylinder args={[0.035, 0.035, 0.42, 6]} position={[0, 0.28, 0]}>
          <meshStandardMaterial color={PALETTE.metal} metalness={0.7} roughness={0.3} />
        </Cylinder>
        {[0, 72, 144, 216, 288].map((deg, i) => (
          <Box
            key={i}
            args={[0.035, 0.03, 0.28]}
            position={[
              Math.sin((deg * Math.PI) / 180) * 0.14,
              0.035,
              Math.cos((deg * Math.PI) / 180) * 0.14,
            ]}
            rotation={[0, (deg * Math.PI) / 180, 0]}
          >
            <meshStandardMaterial color={PALETTE.metal} metalness={0.7} roughness={0.3} />
          </Box>
        ))}
      </group>
    </group>
  );
};

/** Cozy sofa with wood frame */
const Sofa = ({
  position,
  rotation = [0, 0, 0],
  fabricColor = PALETTE.fabric,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  fabricColor?: string;
}) => (
  <group position={position} rotation={rotation}>
    {/* wood frame base */}
    <Box args={[2.6, 0.12, 0.85]} position={[0, 0.16, 0]} castShadow>
      <meshStandardMaterial color={PALETTE.woodMid} roughness={0.6} />
    </Box>
    {/* short wooden legs */}
    {[[-1.15, -0.35], [1.15, -0.35], [-1.15, 0.35], [1.15, 0.35]].map(([x, z], i) => (
      <Cylinder key={i} args={[0.04, 0.04, 0.16, 6]} position={[x, 0.06, z]}>
        <meshStandardMaterial color={PALETTE.woodMid} roughness={0.6} />
      </Cylinder>
    ))}
    {/* seat cushion */}
    <Box args={[2.4, 0.28, 0.75]} position={[0, 0.38, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={fabricColor} roughness={0.8} />
    </Box>
    {/* back cushion */}
    <Box args={[2.4, 0.4, 0.15]} position={[0, 0.68, -0.35]} castShadow>
      <meshStandardMaterial color={fabricColor} roughness={0.8} />
    </Box>
    {/* armrests — wood */}
    <Box args={[0.08, 0.25, 0.75]} position={[-1.28, 0.48, 0]} castShadow>
      <meshStandardMaterial color={PALETTE.woodLight} roughness={0.6} />
    </Box>
    <Box args={[0.08, 0.25, 0.75]} position={[1.28, 0.48, 0]} castShadow>
      <meshStandardMaterial color={PALETTE.woodLight} roughness={0.6} />
    </Box>
  </group>
);

/** Potted plant — ceramic pot with greenery */
const Plant = ({
  position,
  size = "medium",
}: {
  position: Vec3;
  size?: PlantSize;
}) => {
  const h = size === "tall" ? 1.6 : size === "medium" ? 1.0 : 0.5;
  const potH = size === "tall" ? 0.5 : size === "medium" ? 0.4 : 0.25;
  const leafR = size === "tall" ? 0.5 : size === "medium" ? 0.35 : 0.2;

  return (
    <group position={position}>
      {/* ceramic pot */}
      <Cylinder args={[0.22, 0.18, potH, 12]} position={[0, potH / 2, 0]} castShadow>
        <meshStandardMaterial color="#e8ddd0" roughness={0.75} />
      </Cylinder>
      {/* soil */}
      <Cylinder args={[0.2, 0.2, 0.03, 12]} position={[0, potH - 0.01, 0]}>
        <meshStandardMaterial color="#3d2b1f" roughness={0.95} />
      </Cylinder>
      {/* stem */}
      <Cylinder args={[0.025, 0.03, h - potH, 5]} position={[0, potH + (h - potH) / 2, 0]}>
        <meshStandardMaterial color="#5a7a4a" roughness={0.8} />
      </Cylinder>
      {/* foliage */}
      <Sphere args={[leafR, 8, 8]} position={[0, h + leafR * 0.4, 0]}>
        <meshStandardMaterial color={PALETTE.plant} roughness={0.85} />
      </Sphere>
      <Sphere args={[leafR * 0.7, 7, 7]} position={[leafR * 0.4, h, leafR * 0.3]}>
        <meshStandardMaterial color={PALETTE.plantLight} roughness={0.85} />
      </Sphere>
      <Sphere args={[leafR * 0.6, 7, 7]} position={[-leafR * 0.3, h + leafR * 0.2, -leafR * 0.2]}>
        <meshStandardMaterial color={PALETTE.plant} roughness={0.85} />
      </Sphere>
    </group>
  );
};

const GuardedPlant = ({
  position,
  size = "medium",
}: {
  position: Vec3;
  size?: PlantSize;
}) => {
  const safePosition = resolveNoPropZonePosition(position, getPlantFootprint(size));
  return <Plant position={safePosition} size={size} />;
};

/** Simple bookshelf */
const Bookshelf = ({
  position,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
}) => (
  <group position={position} rotation={rotation}>
    {/* frame — tall rectangle */}
    <Box args={[1.6, 2.4, 0.35]} position={[0, 1.2, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={PALETTE.woodLight} roughness={0.65} />
    </Box>
    {/* shelves */}
    {[0.4, 0.95, 1.5, 2.05].map((y, i) => (
      <Box key={i} args={[1.5, 0.03, 0.32]} position={[0, y, 0.02]}>
        <meshStandardMaterial color={PALETTE.woodMid} roughness={0.6} />
      </Box>
    ))}
    {/* books (coloured blocks) */}
    {[
      { x: -0.5, y: 0.55, color: "#8b6b4a" },
      { x: -0.25, y: 0.55, color: "#6b8b7a" },
      { x: 0.05, y: 0.55, color: "#a0785a" },
      { x: 0.3, y: 0.55, color: "#7a8b9a" },
      { x: -0.4, y: 1.1, color: "#9a7b6a" },
      { x: -0.1, y: 1.1, color: "#6a7a6b" },
      { x: 0.2, y: 1.1, color: "#8a7060" },
      { x: -0.3, y: 1.65, color: "#7b8a7a" },
      { x: 0.0, y: 1.65, color: "#9a8b7a" },
      { x: 0.35, y: 1.65, color: "#6b7b8a" },
    ].map((book, i) => (
      <Box key={i} args={[0.15, 0.28, 0.22]} position={[book.x, book.y, 0.03]}>
        <meshStandardMaterial color={book.color} roughness={0.8} />
      </Box>
    ))}
  </group>
);

/** File cabinet — tan/wood cabinet with drawers, clickable */
const FileCabinet = ({
  position,
  rotation = [0, 0, 0],
  onClick,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  onClick?: () => void;
}) => (
  <group
    position={position}
    rotation={rotation}
    onClick={(e) => {
      e.stopPropagation();
      onClick?.();
    }}
    onPointerOver={(e) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
    }}
    onPointerOut={(e) => {
      e.stopPropagation();
      document.body.style.cursor = "default";
    }}
  >
    {/* Cabinet body */}
    <Box args={[0.7, 1.4, 0.5]} position={[0, 0.7, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#c8b898" roughness={0.7} />
    </Box>
    {/* Drawer fronts */}
    {[0.25, 0.65, 1.05].map((y, i) => (
      <group key={i}>
        <Box args={[0.62, 0.28, 0.02]} position={[0, y, 0.26]}>
          <meshStandardMaterial color="#d4c4a8" roughness={0.65} />
        </Box>
        {/* Drawer handle */}
        <Cylinder args={[0.02, 0.02, 0.12, 8]} position={[0, y, 0.28]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color={PALETTE.metalLight} metalness={0.6} roughness={0.3} />
        </Cylinder>
      </group>
    ))}
    {/* Label: FILES */}
    <Text
      position={[0, 1.25, 0.27]}
      fontSize={0.08}
      color="#6b5b4a"
      anchorX="center"
      anchorY="middle"
      fontWeight="bold"
    >
      📁 FILES
    </Text>
  </group>
);

/** Coffee table — round, light wood */
const CoffeeTable = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <Cylinder args={[0.8, 0.8, 0.05, 20]} position={[0, 0.45, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={PALETTE.woodLight} roughness={0.6} />
    </Cylinder>
    {/* three angled legs */}
    {[0, 120, 240].map((deg, i) => (
      <Cylinder
        key={i}
        args={[0.03, 0.025, 0.45, 6]}
        position={[
          Math.sin((deg * Math.PI) / 180) * 0.45,
          0.22,
          Math.cos((deg * Math.PI) / 180) * 0.45,
        ]}
        rotation={[
          Math.cos((deg * Math.PI) / 180) * 0.1,
          0,
          -Math.sin((deg * Math.PI) / 180) * 0.1,
        ]}
      >
        <meshStandardMaterial color={PALETTE.woodMid} roughness={0.6} />
      </Cylinder>
    ))}
  </group>
);

/** Tall arc lamp for lounge ambience */
const LoungeFloorLamp = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <Cylinder args={[0.06, 0.08, 0.05, 10]} position={[0, 0.025, 0]}>
      <meshStandardMaterial color={PALETTE.metal} roughness={0.45} metalness={0.55} />
    </Cylinder>
    <Cylinder args={[0.018, 0.02, 2.0, 8]} position={[0, 1.0, 0]}>
      <meshStandardMaterial color={PALETTE.metalLight} roughness={0.35} metalness={0.6} />
    </Cylinder>
    <Cylinder args={[0.018, 0.018, 1.4, 8]} position={[0.58, 2.1, 0]} rotation={[0, 0, -Math.PI / 2.6]}>
      <meshStandardMaterial color={PALETTE.metalLight} roughness={0.35} metalness={0.6} />
    </Cylinder>
    <Sphere args={[0.2, 12, 12]} position={[1.2, 2.43, 0]}>
      <meshStandardMaterial color="#f4e3c3" emissive="#f4e3c3" emissiveIntensity={0.75} />
    </Sphere>
    <pointLight position={[1.2, 2.35, 0]} intensity={0.42} color="#f7dfbe" distance={7} />
  </group>
);

/** Small decor set on table so lounge does not feel empty */
const LoungeTableProps = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <Box args={[0.45, 0.04, 0.3]} position={[-0.18, 0.49, -0.04]} rotation={[0, 0.2, 0]}>
      <meshStandardMaterial color="#5b7d8f" roughness={0.55} />
    </Box>
    <Cylinder args={[0.05, 0.05, 0.08, 12]} position={[0.2, 0.52, 0.05]}>
      <meshStandardMaterial color="#efe6d7" roughness={0.9} />
    </Cylinder>
    <Cylinder args={[0.055, 0.055, 0.012, 12]} position={[0.2, 0.48, 0.05]}>
      <meshStandardMaterial color="#d7c5ad" roughness={0.92} />
    </Cylinder>
    <Sphere args={[0.05, 8, 8]} position={[-0.34, 0.49, 0.13]}>
      <meshStandardMaterial color="#7897a7" roughness={0.35} metalness={0.25} />
    </Sphere>
  </group>
);

/** Woven rug (flat textured circle) */
const Rug = ({
  position,
  radius = 2.5,
  color = "#d4c4ae",
}: {
  position: [number, number, number];
  radius?: number;
  color?: string;
}) => (
  <Cylinder args={[radius, radius, 0.015, 32]} position={position} receiveShadow>
    <meshStandardMaterial color={color} roughness={0.95} />
  </Cylinder>
);

/* ─── Procedural Daytime City Skyline ──────────────────────── */

type BuildingDef = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  accent: string;
  hasAntenna?: boolean;
  hasRoofBox?: boolean;
  windowColor: string;
  windowOpacity: number;
};

/** Seeded pseudo-random for deterministic skyline */
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

/* Daytime building palettes — glass, concrete, warm stone */
const DAY_BUILDING_COLORS = [
  "#b8c4d0", "#a0aab8", "#c8cdd5", "#95a0af", "#d0d4da",
  "#8a95a5", "#bec6cf", "#a8b0bc", "#cfd3d9", "#9aa5b2",
  "#e0d8c8", "#d4c8b0", "#c8bca8", "#ddd5c5", "#e8e0d0",
];
const DAY_ACCENT_COLORS = [
  "#7a8a9a", "#8898a8", "#6a7a8a", "#909aa5", "#a0a8b0",
];
const DAY_WINDOW_COLORS = [
  "#a8d4f0", "#90c8e8", "#b8ddf5", "#80bce0", "#c0e0f8",
  "#d0e8f8", "#e8f4ff",
];

const generateDaytimeBuildings = (): BuildingDef[] => {
  const r = seeded(77);
  const buildings: BuildingDef[] = [];

  // Row 1 — close (x 25-34), shorter variety
  for (let z = -24; z <= 24; z += 2.8 + r() * 0.8) {
    const w = 1.6 + r() * 2.4;
    const d = 1.6 + r() * 2.0;
    const h = 3 + r() * 14;
    buildings.push({
      x: 25 + r() * 9,
      z: z + (r() - 0.5) * 1.5,
      w, d, h,
      color: DAY_BUILDING_COLORS[Math.floor(r() * DAY_BUILDING_COLORS.length)],
      accent: DAY_ACCENT_COLORS[Math.floor(r() * DAY_ACCENT_COLORS.length)],
      windowColor: DAY_WINDOW_COLORS[Math.floor(r() * DAY_WINDOW_COLORS.length)],
      windowOpacity: 0.6 + r() * 0.3,
      hasAntenna: r() > 0.8,
      hasRoofBox: r() > 0.65,
    });
  }

  // Row 2 — mid (x 36-52), taller downtown
  for (let z = -26; z <= 26; z += 3.5 + r() * 1.2) {
    const w = 2.2 + r() * 3.5;
    const d = 2.0 + r() * 2.5;
    const h = 10 + r() * 28;
    buildings.push({
      x: 36 + r() * 16,
      z: z + (r() - 0.5) * 2,
      w, d, h,
      color: DAY_BUILDING_COLORS[Math.floor(r() * DAY_BUILDING_COLORS.length)],
      accent: DAY_ACCENT_COLORS[Math.floor(r() * DAY_ACCENT_COLORS.length)],
      windowColor: DAY_WINDOW_COLORS[Math.floor(r() * DAY_WINDOW_COLORS.length)],
      windowOpacity: 0.5 + r() * 0.35,
      hasAntenna: r() > 0.7,
      hasRoofBox: r() > 0.5,
    });
  }

  // Row 3 — far silhouettes (x 55-80)
  for (let z = -30; z <= 30; z += 4 + r() * 2) {
    const w = 3 + r() * 5;
    const d = 3 + r() * 3;
    const h = 15 + r() * 40;
    buildings.push({
      x: 55 + r() * 25,
      z: z + (r() - 0.5) * 3,
      w, d, h,
      color: DAY_BUILDING_COLORS[Math.floor(r() * DAY_BUILDING_COLORS.length)],
      accent: DAY_ACCENT_COLORS[Math.floor(r() * DAY_ACCENT_COLORS.length)],
      windowColor: DAY_WINDOW_COLORS[Math.floor(r() * DAY_WINDOW_COLORS.length)],
      windowOpacity: 0.3 + r() * 0.25,
      hasAntenna: r() > 0.75,
      hasRoofBox: r() > 0.6,
    });
  }

  return buildings;
};

const CITY_BUILDINGS = generateDaytimeBuildings();

/** Single building with window grid, rooftop details, and ledges */
const DayBuilding = ({ b }: { b: BuildingDef }) => {
  const windowRows = Math.min(Math.floor(b.h / 1.4), 16);
  const windowCols = Math.max(1, Math.floor(b.w / 0.7));
  const r = seeded(Math.floor(b.x * 100 + b.z * 37));

  return (
    <group position={[b.x, b.h / 2, b.z]}>
      {/* Main body */}
      <Box args={[b.w, b.h, b.d]}>
        <meshStandardMaterial color={b.color} roughness={0.75} />
      </Box>

      {/* Rooftop ledge */}
      <Box args={[b.w + 0.15, 0.12, b.d + 0.15]} position={[0, b.h / 2, 0]}>
        <meshStandardMaterial color={b.accent} roughness={0.65} />
      </Box>

      {/* Mid-building ledge */}
      {b.h > 8 && (
        <Box args={[b.w + 0.1, 0.08, b.d + 0.1]} position={[0, 0, 0]}>
          <meshStandardMaterial color={b.accent} roughness={0.7} />
        </Box>
      )}

      {/* Ground-floor darker base */}
      <Box args={[b.w + 0.02, 1.5, b.d + 0.02]} position={[0, -b.h / 2 + 0.75, 0]}>
        <meshStandardMaterial color={b.accent} roughness={0.8} />
      </Box>

      {/* Roof AC / mechanical box */}
      {b.hasRoofBox && (
        <Box
          args={[b.w * 0.3, 0.8, b.d * 0.3]}
          position={[b.w * 0.15, b.h / 2 + 0.4, 0]}
        >
          <meshStandardMaterial color={b.accent} roughness={0.85} />
        </Box>
      )}

      {/* Antenna */}
      {b.hasAntenna && (
        <Cylinder
          args={[0.03, 0.03, 2.5, 6]}
          position={[0, b.h / 2 + 1.25, 0]}
        >
          <meshStandardMaterial color="#888" roughness={0.5} metalness={0.4} />
        </Cylinder>
      )}

      {/* Window grid — facing the office (negative X face) */}
      {Array.from({ length: windowRows }).map((_, row) =>
        Array.from({ length: windowCols }).map((_, col) => {
          const lit = r() > 0.2;
          if (!lit) return null;
          const reflectivity = 0.3 + r() * 0.5;
          return (
            <Box
              key={`${row}-${col}`}
              args={[0.01, 0.45, 0.35]}
              position={[
                -b.w / 2 - 0.01,
                -b.h / 2 + 1.8 + row * 1.4,
                -b.w / 2 + 0.45 + col * 0.7,
              ]}
            >
              <meshStandardMaterial
                color={b.windowColor}
                emissive="#e8f0f8"
                emissiveIntensity={reflectivity * 0.15}
                transparent
                opacity={b.windowOpacity}
                roughness={0.05}
                metalness={0.6}
              />
            </Box>
          );
        }),
      )}
    </group>
  );
};

const CitySkyline = () => (
  <group>
    {/* ── Sky ── bright blue daytime gradient */}
    <Plane args={[250, 100]} position={[100, 30, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <meshStandardMaterial color="#87CEEB" roughness={1} />
    </Plane>
    {/* Upper sky — deeper blue */}
    <Plane args={[250, 40]} position={[102, 55, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <meshStandardMaterial color="#5BA3D9" roughness={1} />
    </Plane>
    {/* Horizon haze — warm light */}
    <Plane args={[250, 12]} position={[98, 3, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <meshStandardMaterial
        color="#d4e4f0"
        emissive="#e8d8c8"
        emissiveIntensity={0.15}
        roughness={1}
      />
    </Plane>

    {/* ── Ground outside — asphalt / street */}
    <Plane args={[80, 200]} rotation={[-Math.PI / 2, 0, 0]} position={[50, -0.1, 0]}>
      <meshStandardMaterial color="#6b6d70" roughness={0.9} />
    </Plane>
    {/* Sidewalk strip */}
    <Box args={[3, 0.08, 50]} position={[22, 0.04, 0]}>
      <meshStandardMaterial color="#b0b3b8" roughness={0.85} />
    </Box>
    {/* Road markings */}
    {[-12, -4, 4, 12].map((z, i) => (
      <Box key={i} args={[1.5, 0.02, 0.15]} position={[24, 0.02, z]}>
        <meshStandardMaterial color="#e8e8e0" roughness={0.8} />
      </Box>
    ))}

    {/* ── Buildings ── */}
    {CITY_BUILDINGS.map((b, i) => (
      <DayBuilding key={i} b={b} />
    ))}

    {/* ── Trees along the street ── */}
    {[-18, -12, -6, 0, 6, 12, 18].map((z, i) => (
      <group key={`tree-${i}`} position={[22, 0, z]}>
        {/* Trunk */}
        <Cylinder args={[0.08, 0.12, 1.6, 6]} position={[0, 0.8, 0]}>
          <meshStandardMaterial color="#8B6D4A" roughness={0.9} />
        </Cylinder>
        {/* Canopy */}
        <Sphere args={[0.7, 8, 8]} position={[0, 2, 0]}>
          <meshStandardMaterial color="#4a8a52" roughness={0.85} />
        </Sphere>
        <Sphere args={[0.55, 8, 8]} position={[0.3, 2.2, 0.2]}>
          <meshStandardMaterial color="#5a9a5e" roughness={0.85} />
        </Sphere>
      </group>
    ))}

    {/* ── Clouds ── fluffy white spheres */}
    {[
      { x: 50, y: 35, z: -15, s: 4 },
      { x: 65, y: 40, z: 8, s: 5 },
      { x: 45, y: 38, z: 18, s: 3.5 },
      { x: 80, y: 42, z: -5, s: 6 },
      { x: 55, y: 36, z: -22, s: 3 },
      { x: 70, y: 44, z: 20, s: 4.5 },
    ].map((c, i) => (
      <group key={`cloud-${i}`} position={[c.x, c.y, c.z]}>
        <Sphere args={[c.s, 8, 8]}>
          <meshStandardMaterial color="#ffffff" roughness={1} />
        </Sphere>
        <Sphere args={[c.s * 0.75, 8, 8]} position={[c.s * 0.6, -c.s * 0.15, c.s * 0.3]}>
          <meshStandardMaterial color="#f8f8ff" roughness={1} />
        </Sphere>
        <Sphere args={[c.s * 0.65, 8, 8]} position={[-c.s * 0.5, -c.s * 0.1, -c.s * 0.2]}>
          <meshStandardMaterial color="#f0f4ff" roughness={1} />
        </Sphere>
      </group>
    ))}

    {/* ── Sun ── */}
    <Sphere args={[3, 16, 16]} position={[80, 50, -10]}>
      <meshStandardMaterial
        color="#FFF8E0"
        emissive="#FFE066"
        emissiveIntensity={1.5}
      />
    </Sphere>
    <pointLight position={[80, 50, -10]} intensity={0.6} color="#FFF0D0" distance={150} />

    {/* ── Daylight fill through window ── */}
    <directionalLight position={[30, 20, 0]} intensity={0.5} color="#fff8e8" />
    <pointLight position={[25, 6, -10]} intensity={0.15} color="#ffe8c0" distance={25} />
    <pointLight position={[25, 6, 10]} intensity={0.15} color="#ffe8c0" distance={25} />
  </group>
);

/* ─── main scene ───────────────────────────────────────────── */

type OfficeEnvironmentProps = {
  agentCount?: number;
  runningCount?: number;
  gatewayStatus?: GatewayStatus;
  totalMessages?: number;
  activityEntries?: ActivityEntry[];
  /** Map of desk position key "x,z" → agent info for monitor display */
  deskAgents?: Map<string, DeskAgentInfo>;
  /** Called when either file cabinet is clicked */
  onOpenFileManager?: () => void;
  /** Whether the wall TV audio is muted */
  tvMuted?: boolean;
  /** Increment to skip to next track on the wall TV */
  tvSkipSignal?: number;
  /** Volume level 0-100 for the wall TV */
  tvVolume?: number;
};

export const OfficeEnvironment = ({
  agentCount = 0,
  runningCount = 0,
  gatewayStatus = "disconnected",
  totalMessages = 0,
  activityEntries = [],
  deskAgents,
  onOpenFileManager,
  tvMuted = true,
  tvSkipSignal = 0,
  tvVolume = 50,
}: OfficeEnvironmentProps) => {
  const tvIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Mute/unmute the YouTube iframe via postMessage
  useEffect(() => {
    const iframe = tvIframeRef.current;
    if (!iframe?.contentWindow) return;
    const command = tvMuted ? "mute" : "unMute";
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: command, args: [] }),
      "*"
    );
  }, [tvMuted]);

  // Set volume on the YouTube iframe via postMessage
  useEffect(() => {
    const iframe = tvIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "setVolume", args: [tvVolume] }),
      "*"
    );
  }, [tvVolume]);

  // Skip to next track when tvSkipSignal changes
  const prevSkipRef = useRef(tvSkipSignal);
  useEffect(() => {
    if (tvSkipSignal === prevSkipRef.current) return;
    prevSkipRef.current = tvSkipSignal;
    const iframe = tvIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "nextVideo", args: [] }),
      "*"
    );
  }, [tvSkipSignal]);

  /** Look up agent for a desk at this position */
  const agentAt = (x: number, z: number): DeskAgentInfo | undefined =>
    deskAgents?.get(`${x},${z}`);

  return (
    <group>
      {/* ── Floor — light oak planks ──────────────────────── */}
      <Plane
        args={[40, 40]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={PALETTE.floor} roughness={0.7} />
      </Plane>

      {/* ── Walls — warm white ────────────────────────────── */}
      {/* back */}
      <Box args={[40, 8, 0.25]} position={[0, 4, -20]} receiveShadow>
        <meshStandardMaterial color={PALETTE.wall} roughness={0.8} />
      </Box>
      {/* left */}
      <Box args={[0.25, 8, 40]} position={[-20, 4, 0]} receiveShadow>
        <meshStandardMaterial color={PALETTE.wall} roughness={0.8} />
      </Box>
      {/* right — large window wall (glass panes with frames) */}
      <Box args={[0.08, 8, 40]} position={[20, 4, 0]}>
        <meshStandardMaterial
          color="#c8dcea"
          transparent
          opacity={0.15}
          roughness={0.02}
          metalness={0.1}
        />
      </Box>
      {/* window frame mullions */}
      {[-15, -5, 5, 15].map((z, i) => (
        <Box key={i} args={[0.06, 8, 0.08]} position={[20, 4, z]}>
          <meshStandardMaterial color={PALETTE.woodLight} roughness={0.6} />
        </Box>
      ))}
      <Box args={[0.06, 0.08, 40]} position={[20, 4, 0]}>
        <meshStandardMaterial color={PALETTE.woodLight} roughness={0.6} />
      </Box>

      {/* ── City skyline outside the window ───────────────── */}
      <CitySkyline />

      {/* front wall */}
      <Box args={[40, 8, 0.25]} position={[0, 4, 20]} receiveShadow>
        <meshStandardMaterial color={PALETTE.wall} roughness={0.8} />
      </Box>

      {/* baseboard trim */}
      <Box args={[39.5, 0.12, 0.06]} position={[0, 0.06, -19.8]}>
        <meshStandardMaterial color={PALETTE.wallAccent} roughness={0.7} />
      </Box>
      <Box args={[0.06, 0.12, 39.5]} position={[-19.8, 0.06, 0]}>
        <meshStandardMaterial color={PALETTE.wallAccent} roughness={0.7} />
      </Box>
      <Box args={[39.5, 0.12, 0.06]} position={[0, 0.06, 19.8]}>
        <meshStandardMaterial color={PALETTE.wallAccent} roughness={0.7} />
      </Box>

      {/* ── Ceiling ───────────────────────────────────────── */}
      <Plane args={[40, 40]} rotation={[Math.PI / 2, 0, 0]} position={[0, 8, 0]}>
        <meshStandardMaterial color={PALETTE.ceiling} roughness={0.9} />
      </Plane>

      {/* ── Pendant lamps ─────────────────────────────────── */}
      <PendantLamp position={[-8, 8, -5.5]} color="#f5e2c0" />
      <PendantLamp position={[0, 8, -5.5]} color="#f5e2c0" />
      <PendantLamp position={[8, 8, -5.5]} color="#f5e2c0" />
      <PendantLamp position={[0, 8, 10]} color="#f5deb8" />

      {/* ── Workstations ──────────────────────────────────── */}
      {/* front row */}
      <Workstation position={[-10, 0, -8]} agent={agentAt(-10, -8)} />
      <Workstation position={[-5, 0, -8]} agent={agentAt(-5, -8)} />
      <Workstation position={[5, 0, -8]} agent={agentAt(5, -8)} />
      <Workstation position={[10, 0, -8]} agent={agentAt(10, -8)} />
      {/* back row — facing opposite */}
      <Workstation position={[-10, 0, -3]} rotation={[0, Math.PI, 0]} agent={agentAt(-10, -3)} />
      <Workstation position={[-5, 0, -3]} rotation={[0, Math.PI, 0]} agent={agentAt(-5, -3)} />
      <Workstation position={[5, 0, -3]} rotation={[0, Math.PI, 0]} agent={agentAt(5, -3)} />
      <Workstation position={[10, 0, -3]} rotation={[0, Math.PI, 0]} agent={agentAt(10, -3)} />
      {/* side wall station variants */}
      <SideWorkstation position={[-16, 0, 7]} rotation={[0, Math.PI / 2, 0]} agent={agentAt(-16, 7)} />
      <SideWorkstation position={[-16, 0, 12]} rotation={[0, Math.PI / 2, 0]} agent={agentAt(-16, 12)} />
      <SideWorkstation position={[16, 0, 7]} rotation={[0, -Math.PI / 2, 0]} agent={agentAt(16, 7)} />
      <SideWorkstation position={[16, 0, 12]} rotation={[0, -Math.PI / 2, 0]} agent={agentAt(16, 12)} />

      {/* ── File cabinets — placed behind desks, clickable ── */}
      <FileCabinet position={[-10, 0, -11]} onClick={onOpenFileManager} />
      <FileCabinet position={[-5, 0, -11]} onClick={onOpenFileManager} />
      <FileCabinet position={[5, 0, -11]} onClick={onOpenFileManager} />
      <FileCabinet position={[10, 0, -11]} onClick={onOpenFileManager} />

      {/* ── Work area rug ─────────────────────────────────── */}
      <Rug position={[0, 0.01, -5.5]} radius={12} color="#d9cdbf" />

      {/* ── Lounge area ───────────────────────────────────── */}
      <group position={[0, 0, 10]}>
        {/* layered rugs to add depth */}
        <Rug position={[0, 0.01, 0]} radius={3.6} color="#c8bba8" />
        <Rug position={[0.35, 0.02, 0.15]} radius={2.2} color="#d8c9b2" />
        {/* seating cluster with slight asymmetry */}
        <CoffeeTable position={[0.2, 0, -0.1]} />
        <LoungeTableProps position={[0.2, 0, -0.1]} />
        <Sofa position={[-2.5, 0, -1.2]} rotation={[0, Math.PI / 2, 0]} fabricColor={PALETTE.fabric} />
        <Sofa position={[0, 0, 2.2]} rotation={[0, Math.PI, 0]} fabricColor="#9a8b7e" />
        {/* side stool / ottoman */}
        <Cylinder args={[0.45, 0.45, 0.32, 18]} position={[2.35, 0.18, 0.95]} castShadow>
          <meshStandardMaterial color="#b59f83" roughness={0.78} />
        </Cylinder>
        {/* warm floor lamp + extra plant for visual balance */}
        <LoungeFloorLamp position={[3.3, 0, 2.5]} />
        <GuardedPlant position={[3.9, 0, 3.0]} size="medium" />
        {/* left/right fill so lounge doesn't feel empty */}
        <Bookshelf position={[-4.9, 0, 2.5]} rotation={[0, Math.PI / 2.1, 0]} />
        <Bookshelf position={[4.9, 0, 2.5]} rotation={[0, -Math.PI / 2.1, 0]} />
        <Box args={[0.9, 0.06, 0.55]} position={[-4.0, 0.48, 1.4]} castShadow>
          <meshStandardMaterial color={PALETTE.woodLight} roughness={0.62} />
        </Box>
        <Box args={[0.9, 0.06, 0.55]} position={[4.0, 0.48, 1.35]} castShadow>
          <meshStandardMaterial color={PALETTE.woodLight} roughness={0.62} />
        </Box>
        <GuardedPlant position={[-3.9, 0.54, 1.4]} size="small" />
        <GuardedPlant position={[4.0, 0.54, 1.35]} size="small" />
        <LoungeFloorLamp position={[-3.7, 0, 2.35]} />
      </group>

      {/* ── Whiteboard (large analytics board) ───────────── */}
      <group position={[0, 4.2, -19.65]}>
        {/* White surface */}
        <Box args={[10, 5, 0.06]} castShadow>
          <meshStandardMaterial color={PALETTE.white} roughness={0.85} />
        </Box>
        {/* Frame — aluminum/silver */}
        <Box args={[10.3, 5.3, 0.04]} position={[0, 0, -0.02]}>
          <meshStandardMaterial color="#c0c0c0" roughness={0.3} metalness={0.5} />
        </Box>
        {/* Marker tray */}
        <Box args={[6, 0.08, 0.3]} position={[0, -2.6, 0.18]}>
          <meshStandardMaterial color="#c0c0c0" roughness={0.3} metalness={0.4} />
        </Box>
        {/* Markers on the tray */}
        {[
          { x: -1.5, color: "#2563eb" },
          { x: -0.8, color: "#dc2626" },
          { x: -0.1, color: "#16a34a" },
          { x: 0.6, color: "#1a1a1a" },
        ].map((m, i) => (
          <Cylinder key={i} args={[0.04, 0.04, 0.7, 8]} position={[m.x, -2.56, 0.25]} rotation={[0, 0, Math.PI / 2]}>
            <meshStandardMaterial color={m.color} roughness={0.6} />
          </Cylinder>
        ))}

        {/* Analytics content — clean whiteboard style */}
        <Html
          transform
          zIndexRange={[0, 0]}
          position={[0, 0, 0.04]}
          scale={0.27}
          style={{ width: "940px", pointerEvents: "none" }}
        >
          <div
            style={{
              width: 940,
              padding: "36px 40px",
              fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
              color: "#1e293b",
              background: "#ffffff",
              borderRadius: 8,
            }}
          >
            {/* Title */}
            <div style={{ marginBottom: 24, borderBottom: "3px solid #3b82f6", paddingBottom: 12, display: "flex", alignItems: "baseline", gap: 16 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: "#1e293b", letterSpacing: "-0.01em" }}>
                📊 Fleet Dashboard
              </span>
              <span style={{ fontSize: 18, color: "#94a3b8", fontWeight: 500 }}>
                Live stats
              </span>
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 28 }}>
              {[
                { label: "AGENTS", value: agentCount, sub: `${runningCount} active`, accent: "#3b82f6", bg: "#eff6ff", emoji: "🤖" },
                { label: "GATEWAY", value: gatewayStatus === "connected" ? "Online ✓" : "Offline ✗", sub: "", accent: gatewayStatus === "connected" ? "#16a34a" : "#dc2626", bg: gatewayStatus === "connected" ? "#f0fdf4" : "#fef2f2", emoji: "🔌" },
                { label: "MESSAGES", value: totalMessages, sub: "this session", accent: "#7c3aed", bg: "#f5f3ff", emoji: "💬" },
                { label: "ACTIVE", value: runningCount, sub: runningCount > 0 ? "running now" : "idle", accent: runningCount > 0 ? "#16a34a" : "#64748b", bg: runningCount > 0 ? "#f0fdf4" : "#f8fafc", emoji: "⚡" },
              ].map((stat, i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: 10,
                    padding: "18px 20px",
                    background: stat.bg,
                    borderLeft: `4px solid ${stat.accent}`,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: stat.accent, marginBottom: 8 }}>
                    {stat.emoji} {stat.label}
                  </div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
                    {stat.value}
                  </div>
                  {stat.sub && (
                    <div style={{ fontSize: 16, color: "#64748b", marginTop: 6, fontWeight: 500 }}>
                      {stat.sub}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ borderBottom: "2px solid #e2e8f0", marginBottom: 22 }} />

            {/* Activity section */}
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "#1e293b" }}>📋 Recent Activity</span>
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#64748b",
                background: "#f1f5f9",
                padding: "3px 12px",
                borderRadius: 12,
              }}>
                {activityEntries.length} events
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              {activityEntries.length === 0 ? (
                <div style={{ fontSize: 20, color: "#94a3b8", fontStyle: "italic", padding: "16px 0" }}>
                  No activity yet — waiting for agents...
                </div>
              ) : (
                activityEntries.slice(0, 5).map((entry, i) => {
                  const dotColor =
                    entry.status === "ok" ? "#16a34a"
                    : entry.status === "error" ? "#dc2626"
                    : entry.status === "running" ? "#3b82f6"
                    : "#d97706";
                  const tagBg =
                    entry.status === "ok" ? "#f0fdf4"
                    : entry.status === "error" ? "#fef2f2"
                    : entry.status === "running" ? "#eff6ff"
                    : "#fffbeb";
                  const tag =
                    entry.status === "ok" ? "✓ OK"
                    : entry.status === "error" ? "✗ ERR"
                    : entry.status === "running" ? "● RUN"
                    : "◌ WAIT";
                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "10px 16px",
                        borderLeft: `4px solid ${dotColor}`,
                        background: i % 2 === 0 ? "#f8fafc" : "#ffffff",
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", minWidth: 120 }}>
                        {entry.agentName}
                      </span>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: dotColor,
                        letterSpacing: "0.06em",
                        background: tagBg,
                        border: `1.5px solid ${dotColor}`,
                        padding: "2px 10px",
                        borderRadius: 6,
                        whiteSpace: "nowrap" as const,
                      }}>
                        {tag}
                      </span>
                      <span style={{
                        fontSize: 16,
                        color: "#475569",
                        fontWeight: 500,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}>
                        {entry.action}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Timestamp */}
            <div style={{ marginTop: 16, textAlign: "right" as const, fontSize: 14, color: "#94a3b8", fontWeight: 500 }}>
              last updated: just now
            </div>
          </div>
        </Html>
      </group>

      {/* ── Wall-mounted TV — YouTube playlist ────────────── */}
      <group position={[-19.75, 4.2, 0]} rotation={[0, Math.PI / 2, 0]}>
        {/* TV bezel — matte black */}
        <Box args={[5.6, 3.3, 0.1]} castShadow>
          <meshStandardMaterial color="#111111" roughness={0.35} />
        </Box>
        {/* Screen inset */}
        <Box args={[5.2, 2.95, 0.02]} position={[0, 0, 0.06]}>
          <meshStandardMaterial color="#0a0a0a" roughness={0.2} />
        </Box>
        {/* Embedded YouTube iframe — scaled to fill the bezel */}
        <Html
          transform
          zIndexRange={[0, 0]}
          position={[0, 0, 0.08]}
          scale={0.26}
          style={{ width: "720px", height: "405px", pointerEvents: "auto" }}
        >
          <iframe
            ref={tvIframeRef}
            width="720"
            height="405"
            src="https://www.youtube.com/embed/videoseries?list=PLDIoUOhQQPlWc-Kd6TCjTRIl0Z6fSQV0X&autoplay=1&mute=1&loop=1&enablejsapi=1"
            title="Office Music"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ border: "none", borderRadius: 0, background: "#000", display: "block" }}
          />
        </Html>
        {/* Screen glow */}
        <pointLight position={[0, 0, 0.5]} intensity={0.3} color="#a8c4e8" distance={5} decay={2} />
        {/* Wall mount bracket */}
        <Box args={[0.6, 0.6, 0.15]} position={[0, 0, -0.12]}>
          <meshStandardMaterial color="#222222" roughness={0.5} metalness={0.4} />
        </Box>
      </group>

      {/* ── Wall art / poster frames ──────────────────────── */}
      {[
        { x: 4, y: 4, size: [1.2, 1.6, 0.03] as [number, number, number], art: "#b8c4b0" },
        { x: 6, y: 3.8, size: [0.9, 1.2, 0.03] as [number, number, number], art: "#c4b8a0" },
        { x: 10, y: 4.2, size: [1.4, 1.0, 0.03] as [number, number, number], art: "#a8b8c4" },
      ].map((frame, i) => (
        <group key={i} position={[frame.x, frame.y, -19.7]}>
          <Box args={frame.size} castShadow>
            <meshStandardMaterial color={frame.art} roughness={0.85} />
          </Box>
          <Box args={[frame.size[0] + 0.1, frame.size[1] + 0.1, 0.02]}>
            <meshStandardMaterial color={PALETTE.woodLight} roughness={0.6} />
          </Box>
        </group>
      ))}

      {/* ── Plants ────────────────────────────────────────── */}
      <GuardedPlant position={[-18, 0, -18]} size="tall" />
      <GuardedPlant position={[18, 0, -18]} size="tall" />
      <GuardedPlant position={[-18, 0, 18]} size="medium" />
      <GuardedPlant position={[18, 0, 18]} size="tall" />
      {/* divider plants between work and lounge (keep center lane clear for whiteboard visibility) */}
      <GuardedPlant position={[-7, 0, 4]} size="tall" />
      <GuardedPlant position={[7, 0, 4]} size="tall" />
      <GuardedPlant position={[-9, 0, 2.8]} size="medium" />
      <GuardedPlant position={[9, 0, 2.8]} size="medium" />
      {/* desk plants */}
      <GuardedPlant position={[-11.5, 0.95, -8.2]} size="small" />
      <GuardedPlant position={[11.5, 0.95, -8.2]} size="small" />

      {/* ── Lighting ──────────────────────────────────────── */}
      {/* warm natural overhead — simulating daylight from windows */}
      <directionalLight
        position={[25, 12, 0]}
        intensity={0.4}
        color="#fff8e8"
      />
      {/* general warm fill */}
      <pointLight position={[-8, 7, -5]} intensity={0.35} color="#f5e0c0" />
      <pointLight position={[8, 7, -5]} intensity={0.35} color="#f5e0c0" />
      <pointLight position={[0, 7, 0]} intensity={0.25} color="#f0e4d0" />
      {/* lounge warm */}
      <pointLight position={[0, 5, 10]} intensity={0.3} color="#f5deb8" />
      {/* window daylight bounce */}
      <pointLight position={[18, 3, -10]} intensity={0.15} color="#e8f0f8" />
      <pointLight position={[18, 3, 10]} intensity={0.15} color="#e8f0f8" />
    </group>
  );
};
