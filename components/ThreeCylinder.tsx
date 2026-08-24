"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, useGLTF } from "@react-three/drei";
import type { Mesh } from "three";

const DEFAULT_MODEL_PATH = "/Meshy_AI_Refrigerant_Cylinder_0817192714_texture.glb";

interface CylinderModelProps {
  modelPath: string;
}

function CylinderModel({ modelPath }: CylinderModelProps) {
  const { scene } = useGLTF(modelPath);

  // useGLTF caches and returns the SAME scene object to every caller of a
  // given URL. An Object3D can only have one parent, so when several cards
  // render the same model at once, each <primitive> attach would steal it
  // from the last — clone per instance (geometry/material buffers are
  // still shared, only the transform nodes are duplicated).
  const instanceScene = useMemo(() => scene.clone(), [scene]);

  // castShadow/receiveShadow don't cascade from a <primitive> to the
  // meshes inside the loaded scene graph, so set them per-mesh.
  useEffect(() => {
    instanceScene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [instanceScene]);

  return (
    <primitive
      object={instanceScene}
      // Slight rightward lean off the vertical (Z-axis) reads as a more
      // premium, deliberately-posed shot than a perfectly upright cylinder.
      rotation={[0, 0.4, -0.2]}
      position={[0, -0.05, 0]}
    />
  );
}

interface ThreeCylinderProps {
  modelPath?: string;
  /**
   * "full" (default) is for the Hero/PDP hero shot: shadows, contact
   * shadow, drag-to-rotate. "card" is a lighter preview for grid
   * thumbnails — no shadow pass, no manual drag (so it doesn't fight the
   * card's click-to-navigate), lower device pixel ratio since it renders
   * small. Cuts GPU cost meaningfully when several cards render at once.
   */
  variant?: "full" | "card";
}

export default function ThreeCylinder({
  modelPath = DEFAULT_MODEL_PATH,
  variant = "full",
}: ThreeCylinderProps) {
  const isCard = variant === "card";

  return (
    <Canvas
      shadows={!isCard}
      dpr={isCard ? 1 : [1, 2]}
      camera={{ position: [0, 0.15, 5.2], fov: 32 }}
      className="!absolute inset-0"
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 2]} intensity={1.3} castShadow={!isCard} />
      <directionalLight position={[-3, -1, -2]} intensity={0.35} />
      <directionalLight position={[0, -2, 3]} intensity={0.2} />
      <Suspense fallback={null}>
        <CylinderModel modelPath={modelPath} />
      </Suspense>
      {!isCard && (
        <ContactShadows position={[0, -1.1, 0]} opacity={0.35} scale={4} blur={2.4} far={2} />
      )}
      <OrbitControls
        enableRotate={!isCard}
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={1.4}
        minPolarAngle={Math.PI / 2.4}
        maxPolarAngle={Math.PI / 2.4}
      />
    </Canvas>
  );
}
