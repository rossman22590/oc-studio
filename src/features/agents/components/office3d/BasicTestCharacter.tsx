"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type BasicTestCharacterProps = {
  position?: [number, number, number];
};

export const BasicTestCharacter = ({ position = [0, 0, 0] }: BasicTestCharacterProps) => {
  const rootRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const { camera } = useThree();
  const controls = useThree((state) => state.controls) as
    | { target?: THREE.Vector3; update?: () => void }
    | undefined;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      keysRef.current.add(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current || !rootRef.current) return;
    const t = state.clock.elapsedTime;

    const keys = keysRef.current;
    const moveDirection = new THREE.Vector3();
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    const camRight = new THREE.Vector3().crossVectors(camForward, camera.up).normalize();

    const forward = keys.has("KeyW") || keys.has("ArrowUp");
    const back = keys.has("KeyS") || keys.has("ArrowDown");
    const left = keys.has("KeyA") || keys.has("ArrowLeft");
    const right = keys.has("KeyD") || keys.has("ArrowRight");

    if (forward) moveDirection.add(camForward);
    if (back) moveDirection.sub(camForward);
    if (left) moveDirection.sub(camRight);
    if (right) moveDirection.add(camRight);

    const moving = moveDirection.lengthSq() > 0.0001;
    const previousX = rootRef.current.position.x;
    const previousZ = rootRef.current.position.z;

    if (moving) {
      moveDirection.normalize();
      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 5.4 : 3.2;
      rootRef.current.position.x += moveDirection.x * speed * delta;
      rootRef.current.position.z += moveDirection.z * speed * delta;

      rootRef.current.position.x = THREE.MathUtils.clamp(rootRef.current.position.x, -16, 16);
      rootRef.current.position.z = THREE.MathUtils.clamp(rootRef.current.position.z, -16, 16);

      const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
      let angleDiff = targetAngle - rootRef.current.rotation.y;
      angleDiff = ((angleDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
      rootRef.current.rotation.y += angleDiff * Math.min(1, delta * 10);
    }

    // Camera follow: translate camera + orbit target with the character movement.
    const dx = rootRef.current.position.x - previousX;
    const dz = rootRef.current.position.z - previousZ;
    if (Math.abs(dx) > 0.000001 || Math.abs(dz) > 0.000001) {
      camera.position.x += dx;
      camera.position.z += dz;
      if (controls?.target) {
        controls.target.x += dx;
        controls.target.z += dz;
      }
      controls?.update?.();
    }

    // Idle/walk bob.
    groupRef.current.position.y = Math.sin(t * (moving ? 8 : 2)) * (moving ? 0.06 : 0.04);

    const armSwing = Math.sin(t * (moving ? 10 : 3)) * (moving ? 0.55 : 0.15);
    const legSwing = Math.sin(t * (moving ? 10 : 3)) * (moving ? 0.38 : 0.1);

    if (leftArmRef.current) leftArmRef.current.rotation.x = armSwing;
    if (rightArmRef.current) rightArmRef.current.rotation.x = -armSwing;
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing;
  });

  return (
    <group ref={rootRef} position={position}>
      {/* ground marker to confirm exact character position */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 28]} />
        <meshStandardMaterial color="#4f46e5" transparent opacity={0.2} />
      </mesh>

      <group ref={groupRef} position={[0, 1.05, 0]}>
        {/* torso */}
        <mesh castShadow receiveShadow position={[0, 0.95, 0]}>
          <capsuleGeometry args={[0.32, 0.95, 8, 16]} />
          <meshStandardMaterial color="#6d28d9" roughness={0.45} metalness={0.05} />
        </mesh>

        {/* head */}
        <mesh castShadow receiveShadow position={[0, 1.82, 0]}>
          <sphereGeometry args={[0.28, 20, 20]} />
          <meshStandardMaterial color="#f5d0a9" roughness={0.7} />
        </mesh>

        {/* eyes */}
        <mesh position={[-0.09, 1.86, 0.23]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <mesh position={[0.09, 1.86, 0.23]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#111827" />
        </mesh>

        {/* left arm */}
        <group ref={leftArmRef} position={[-0.48, 1.28, 0]}>
          <mesh castShadow receiveShadow position={[0, -0.33, 0]}>
            <capsuleGeometry args={[0.1, 0.52, 6, 12]} />
            <meshStandardMaterial color="#a78bfa" roughness={0.55} />
          </mesh>
        </group>

        {/* right arm */}
        <group ref={rightArmRef} position={[0.48, 1.28, 0]}>
          <mesh castShadow receiveShadow position={[0, -0.33, 0]}>
            <capsuleGeometry args={[0.1, 0.52, 6, 12]} />
            <meshStandardMaterial color="#a78bfa" roughness={0.55} />
          </mesh>
        </group>

        {/* left leg */}
        <group ref={leftLegRef} position={[-0.17, 0.6, 0]}>
          <mesh castShadow receiveShadow position={[0, -0.42, 0]}>
            <capsuleGeometry args={[0.12, 0.68, 6, 12]} />
            <meshStandardMaterial color="#4338ca" roughness={0.5} />
          </mesh>
        </group>

        {/* right leg */}
        <group ref={rightLegRef} position={[0.17, 0.6, 0]}>
          <mesh castShadow receiveShadow position={[0, -0.42, 0]}>
            <capsuleGeometry args={[0.12, 0.68, 6, 12]} />
            <meshStandardMaterial color="#4338ca" roughness={0.5} />
          </mesh>
        </group>
      </group>
    </group>
  );
};
