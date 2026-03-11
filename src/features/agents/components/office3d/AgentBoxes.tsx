import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import type { AgentBoxData } from "../AgentOfficeScene";

/* ─── localStorage helpers for position persistence ──────── */
const STORAGE_KEY = "oc-office-claw-positions";

const saveAssignments = (assignments: Map<string, string>) => {
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of assignments) obj[k] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore quota errors */ }
};

const loadAssignments = (): Map<string, string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
};

/* ─── Snap-point definitions ─────────────────────────────── */

export type SnapPointKind = "desk" | "couch";

export type SnapPoint = {
  id: string;
  kind: SnapPointKind;
  position: [number, number, number];
  seatY: number;
  faceAngle: number;
};

const DESK_SNAPS: SnapPoint[] = [
  { id: "desk-fl2", kind: "desk", position: [-10, 0, -7.9], seatY: 1.25, faceAngle: Math.PI },
  { id: "desk-fl1", kind: "desk", position: [-5, 0, -7.9], seatY: 1.25, faceAngle: Math.PI },
  { id: "desk-fr1", kind: "desk", position: [5, 0, -7.9], seatY: 1.25, faceAngle: Math.PI },
  { id: "desk-fr2", kind: "desk", position: [10, 0, -7.9], seatY: 1.25, faceAngle: Math.PI },
  { id: "desk-bl2", kind: "desk", position: [-10, 0, -3.1], seatY: 1.25, faceAngle: 0 },
  { id: "desk-bl1", kind: "desk", position: [-5, 0, -3.1], seatY: 1.25, faceAngle: 0 },
  { id: "desk-br1", kind: "desk", position: [5, 0, -3.1], seatY: 1.25, faceAngle: 0 },
  { id: "desk-br2", kind: "desk", position: [10, 0, -3.1], seatY: 1.25, faceAngle: 0 },
  // Back-corner side workstations
  { id: "desk-lw1", kind: "desk", position: [-16, 0, 7], seatY: 1.25, faceAngle: Math.PI / 2 },
  { id: "desk-lw2", kind: "desk", position: [-16, 0, 12], seatY: 1.25, faceAngle: Math.PI / 2 },
  { id: "desk-rw1", kind: "desk", position: [16, 0, 7], seatY: 1.25, faceAngle: -Math.PI / 2 },
  { id: "desk-rw2", kind: "desk", position: [16, 0, 12], seatY: 1.25, faceAngle: -Math.PI / 2 },
];

const COUCH_SNAPS: SnapPoint[] = [
  { id: "couch-l1", kind: "couch", position: [-2.5, 0, 8.2], seatY: 0.65, faceAngle: Math.PI / 2 },
  { id: "couch-l2", kind: "couch", position: [-2.5, 0, 9.4], seatY: 0.65, faceAngle: Math.PI / 2 },
  { id: "couch-b1", kind: "couch", position: [-0.7, 0, 12.2], seatY: 0.65, faceAngle: Math.PI },
  { id: "couch-b2", kind: "couch", position: [0.7, 0, 12.2], seatY: 0.65, faceAngle: Math.PI },
];

export const ALL_SNAP_POINTS: SnapPoint[] = [...DESK_SNAPS, ...COUCH_SNAPS];

const VALID_SNAP_IDS = new Set(ALL_SNAP_POINTS.map((sp) => sp.id));

/**
 * Keep persisted assignments resilient across layout changes:
 * - drop unknown snap ids
 * - keep only one snap per agent (latest wins)
 */
const normalizeAssignments = (input: Map<string, string>): Map<string, string> => {
  const latestSnapByAgent = new Map<string, string>();
  for (const [snapId, agentId] of input) {
    if (!VALID_SNAP_IDS.has(snapId)) continue;
    if (!agentId) continue;
    latestSnapByAgent.set(agentId, snapId);
  }
  const normalized = new Map<string, string>();
  for (const [agentId, snapId] of latestSnapByAgent) {
    normalized.set(snapId, agentId);
  }
  return normalized;
};

/* ─── WASD keyboard camera movement ─────────────────────── */

/** Drop this inside the <Canvas> to get WASD + QE camera pan + right-click vertical */
export const WASDControls = () => {
  const { camera, gl } = useThree();
  const keys = useRef<Set<string>>(new Set());
  const rightDrag = useRef<{ active: boolean; lastY: number }>({ active: false, lastY: 0 });

  // Access OrbitControls via useThree (needs makeDefault on <OrbitControls>)
  const controls = useThree((s) => s.controls) as any;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Right-click drag → move camera up/down
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        rightDrag.current = { active: true, lastY: e.clientY };
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!rightDrag.current.active) return;
      const dy = (rightDrag.current.lastY - e.clientY) * 0.04;
      rightDrag.current.lastY = e.clientY;
      camera.position.y += dy;
      const ctrl = controlsRef.current;
      if (ctrl?.target) ctrl.target.y += dy;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) rightDrag.current.active = false;
    };
    const onContext = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContext);
    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContext);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera]);

  useFrame((_, delta) => {
    const speed = 18 * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    const move = new THREE.Vector3();
    if (keys.current.has("w")) move.addScaledVector(forward, speed);
    if (keys.current.has("s")) move.addScaledVector(forward, -speed);
    if (keys.current.has("a")) move.addScaledVector(right, -speed);
    if (keys.current.has("d")) move.addScaledVector(right, speed);
    if (keys.current.has("q")) move.y -= speed;
    if (keys.current.has("e")) move.y += speed;

    if (move.lengthSq() > 0) {
      camera.position.add(move);
      if (controls?.target) {
        controls.target.add(move);
      }
    }

    // ── ALWAYS clamp camera inside walls — catches WASD, orbit pan, zoom, rotate ──
    const BOUNDS = { minX: -18, maxX: 18, minZ: -18, maxZ: 18, minY: 1, maxY: 7.5 };

    const clampAndSync = () => {
      const dx = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, camera.position.x)) - camera.position.x;
      const dz = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, camera.position.z)) - camera.position.z;
      const dy = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, camera.position.y)) - camera.position.y;
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        camera.position.x += dx;
        camera.position.y += dy;
        camera.position.z += dz;
        if (controls?.target) {
          controls.target.x += dx;
          controls.target.y += dy;
          controls.target.z += dz;
        }
      }
    };

    clampAndSync();

    // Also clamp the orbit target itself so panning can't drag it outside
    if (controls?.target) {
      controls.target.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, controls.target.x));
      controls.target.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, controls.target.z));
      controls.target.y = Math.max(0.5, Math.min(BOUNDS.maxY, controls.target.y));
    }
  });

  return null;
};

/* ─── Component props ────────────────────────────────────── */

type AgentBoxesProps = {
  agents: AgentBoxData[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  onOpenChat?: (id: string) => void;
  onViewDetails?: (id: string) => void;
};

export const AgentBoxes = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  onOpenChat,
  onViewDetails,
}: AgentBoxesProps) => {
  /* ── assignment state: snapId → agentId — initialized from localStorage ── */
  const [assignments, setAssignments] = useState<Map<string, string>>(() =>
    normalizeAssignments(loadAssignments())
  );
  /* ── "picked up" agent — glows, waiting for hotspot click ── */
  const [pickedAgentId, setPickedAgentId] = useState<string | null>(null);

  // Auto-assign unplaced agents, but keep existing saved positions.
  // IMPORTANT: skip when agents list is empty (hasn't loaded yet) to avoid
  // wiping saved positions — that was causing back-desk lobsters to vanish.
  useEffect(() => {
    if (agents.length === 0) return;

    setAssignments((prev) => {
      const next = normalizeAssignments(new Map(prev));

      // Only remove truly stale agents (gone from the list).
      const currentIds = new Set(agents.map((a) => a.id));
      for (const [snapId, agentId] of next) {
        if (!currentIds.has(agentId)) next.delete(snapId);
      }

      const placed = new Set(next.values());
      const free = ALL_SNAP_POINTS.filter((sp) => !next.has(sp.id));
      for (const agent of agents) {
        if (placed.has(agent.id)) continue;
        const slot = free.shift();
        if (slot) {
          next.set(slot.id, agent.id);
          placed.add(agent.id);
        }
      }
      return normalizeAssignments(next);
    });
  }, [agents]);

  // Persist assignments to localStorage on every change
  useEffect(() => {
    saveAssignments(normalizeAssignments(assignments));
  }, [assignments]);

  const assignAgent = useCallback((agentId: string, snapId: string) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      for (const [sid, aid] of next) {
        if (aid === agentId) { next.delete(sid); break; }
      }
      next.delete(snapId);
      next.set(snapId, agentId);
      return next;
    });
  }, []);

  const occupiedSet = useMemo(() => new Set(assignments.keys()), [assignments]);

  const agentSnap = useCallback(
    (agentId: string): SnapPoint | null => {
      for (const [snapId, aid] of assignments) {
        if (aid === agentId) return ALL_SNAP_POINTS.find((sp) => sp.id === snapId) ?? null;
      }
      return null;
    },
    [assignments],
  );

  /* ── click a lobster → pick it up (or put it down) ── */
  const handleAgentClick = useCallback(
    (agentId: string) => {
      if (pickedAgentId === agentId) {
        // click same agent again → deselect
        setPickedAgentId(null);
      } else {
        setPickedAgentId(agentId);
        onSelectAgent(agentId);
      }
    },
    [pickedAgentId, onSelectAgent],
  );

  /* ── click a hotspot → teleport the picked agent there ── */
  const handleHotspotClick = useCallback(
    (snapId: string) => {
      if (!pickedAgentId) return;
      assignAgent(pickedAgentId, snapId);
      setPickedAgentId(null);
    },
    [pickedAgentId, assignAgent],
  );

  return (
    <group>
      {/* ── Hotspot markers ── */}
      {ALL_SNAP_POINTS.map((sp) => {
        const isOccupied = occupiedSet.has(sp.id);
        const isTarget = pickedAgentId !== null && !isOccupied;
        return (
          <HotspotMarker
            key={sp.id}
            snap={sp}
            isOccupied={isOccupied}
            isTarget={isTarget}
            onClick={() => handleHotspotClick(sp.id)}
          />
        );
      })}

      {/* ── Agent lobsters ── */}
      {agents.map((agent, index) => (
        <LobsterAgent
          key={agent.id}
          agent={agent}
          index={index}
          snap={agentSnap(agent.id)}
          isPicked={agent.id === pickedAgentId}
          isSelected={agent.id === selectedAgentId}
          onClick={() => handleAgentClick(agent.id)}
          onOpenChat={onOpenChat}
          onViewDetails={onViewDetails}
          onSelect={() => onSelectAgent(agent.id)}
        />
      ))}
    </group>
  );
};

/* ─── Hotspot marker (clickable when an agent is picked) ── */

const HotspotMarker = ({
  snap,
  isOccupied,
  isTarget,
  onClick,
}: {
  snap: SnapPoint;
  isOccupied: boolean;
  isTarget: boolean;
  onClick: () => void;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  // Pulsing animation when this spot is a valid target
  useFrame((state) => {
    if (ringRef.current) {
      if (isTarget) {
        const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 4) * 0.5;
        ringRef.current.scale.setScalar(1 + pulse * 0.15);
        (ringRef.current.material as THREE.MeshStandardMaterial).opacity = 0.4 + pulse * 0.5;
      }
    }
  });

  if (isOccupied && !isTarget) {
    // Occupied and no pick → invisible
    return null;
  }

  const baseColor = snap.kind === "desk" ? "#79A3FF" : "#FFB347";
  const targetColor = "#00ff88";

  return (
    <group position={[snap.position[0], snap.kind === "desk" ? 0.96 : snap.seatY - 0.02, snap.position[2]]}>
      {/* Flat disc indicator */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          if (isTarget) onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (isTarget) document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "default";
        }}
      >
        <cylinderGeometry args={[0.5, 0.5, 0.03, 24]} />
        <meshStandardMaterial
          color={isTarget ? targetColor : baseColor}
          transparent
          opacity={isTarget ? 0.7 : 0.2}
          depthWrite={false}
          emissive={isTarget ? targetColor : baseColor}
          emissiveIntensity={isTarget ? 0.8 : 0}
        />
      </mesh>

      {/* Glowing ring when targetable */}
      {isTarget && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <torusGeometry args={[0.6, 0.06, 8, 32]} />
          <meshStandardMaterial
            color={targetColor}
            emissive={targetColor}
            emissiveIntensity={2}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}

      {/* "Place here" label when targetable */}
      {isTarget && (
        <Text
          position={[0, 0.6, 0]}
          fontSize={0.2}
          color="#00ff88"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="black"
        >
          {snap.kind === "desk" ? "⬇ Desk" : "⬇ Couch"}
        </Text>
      )}
    </group>
  );
};

/* ─── Lobster agent (click to pick, NO dragging) ───────── */

const LobsterAgent = ({
  agent,
  index,
  snap,
  isPicked,
  isSelected,
  onClick,
  onOpenChat,
  onViewDetails,
  onSelect,
}: {
  agent: AgentBoxData;
  index: number;
  snap: SnapPoint | null;
  isPicked: boolean;
  isSelected: boolean;
  onClick: () => void;
  onOpenChat?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  onSelect: () => void;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const uiGroupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/lobster.glb");
  const model = useMemo(() => scene.clone(), [scene]);

  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Target position & rotation from snap assignment — NO drag
  const targetPos = useMemo<[number, number, number]>(() => {
    if (snap) return [snap.position[0], snap.seatY, snap.position[2]];
    return [-15 + index * 2, 0.5, 16];
  }, [snap, index]);

  const targetRot = snap ? snap.faceAngle : 0;

  /* ── animation ── */
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const pos = groupRef.current.position;

    // Smooth lerp to target
    const tgt = new THREE.Vector3(...targetPos);
    pos.lerp(tgt, delta * 6);

    // Smooth rotation — don't rotate on click, just smoothly face faceAngle
    const rDiff = targetRot - groupRef.current.rotation.y;
    // Wrap around to shortest path
    const wrapped = ((rDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
    groupRef.current.rotation.y += wrapped * delta * 4;

    // Floating bobble
    const floatOffset = Math.sin(state.clock.elapsedTime * 2 + index) * 0.06;
    pos.y = targetPos[1] + floatOffset;

    // When picked: float up higher + strong pulse
    if (isPicked) {
      pos.y += 0.4 + Math.sin(state.clock.elapsedTime * 5) * 0.15;
      const s = 1.15 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
      groupRef.current.scale.setScalar(s);
    } else if (isSelected) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.06;
      groupRef.current.scale.setScalar(s);
    } else if (hovered) {
      groupRef.current.scale.lerp(new THREE.Vector3(1.06, 1.06, 1.06), delta * 8);
    } else {
      groupRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 5);
    }

    // Keep the UI overlay group tracking the lobster's actual world position
    if (uiGroupRef.current) {
      uiGroupRef.current.position.set(pos.x, 0, pos.z);
    }
  });

  // UI heights relative to the lobster's base seatY
  const seatY = snap?.seatY ?? 0.5;
  const labelY = seatY + 1.3;
  const dotY = seatY + 0.85;

  return (
    <group>
      {/* The lobster model */}
      <group
        ref={groupRef}
        position={targetPos}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <primitive object={model} scale={0.5} castShadow receiveShadow />

        {/* Glow overlay — bright when picked, subtle otherwise */}
        <mesh scale={0.52}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial
            color={isPicked ? "#00ffcc" : agent.color}
            transparent
            opacity={isPicked ? 0.35 : hovered ? 0.15 : 0.08}
            emissive={isPicked ? "#00ffcc" : agent.color}
            emissiveIntensity={isPicked ? 2.5 : isSelected ? 0.6 : hovered ? 0.3 : 0.1}
            depthWrite={false}
          />
        </mesh>

        {/* Point light glow when picked */}
        {isPicked && (
          <pointLight color="#00ffcc" intensity={3} distance={5} decay={2} />
        )}
      </group>

      {/* ── Floating UI – tracks the lobster's ACTUAL animated position ── */}
      <group ref={uiGroupRef} position={[targetPos[0], 0, targetPos[2]]}>
        {/* Name label - Always visible for all users (owners and guests) */}
        <Text
          position={[0, labelY, 0]}
          fontSize={0.3}
          color={isPicked ? "#00ffcc" : "white"}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="black"
          fontWeight={isPicked ? "bold" : "normal"}
          renderOrder={1000}
        >
          {isPicked ? `✦ ${agent.name} ✦` : agent.name}
        </Text>

        {/* Status dot */}
        <mesh
          position={[0, dotY, 0]}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
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
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial
            color={agent.status === "working" ? "#00ff00" : "#ffaa00"}
            emissive={agent.status === "working" ? "#00ff00" : "#ffaa00"}
            emissiveIntensity={menuOpen ? 2 : 1}
          />
        </mesh>

        {/* Context Menu */}
        {menuOpen && (
          <Html position={[0, labelY, 0]} center zIndexRange={[10, 10]}>
            <div
              className="glass-panel px-2 py-1 min-w-32 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (onOpenChat) onOpenChat(agent.id);
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-primary/20 rounded transition"
              >
                💬 Send Chat
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (onViewDetails) onViewDetails(agent.id);
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-primary/20 rounded transition"
              >
                👁️ View Details
              </button>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted rounded transition"
              >
                ✕ Close
              </button>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
};

useGLTF.preload("/lobster.glb");
