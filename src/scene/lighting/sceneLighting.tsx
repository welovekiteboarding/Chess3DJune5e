import { sceneLightingContract } from './sceneLightingContract';

export function SceneLighting() {
  const { ambientFill, backgroundColor, fillLight, fog, hemisphereFill, keyLight, rimLight } =
    sceneLightingContract;

  return (
    <>
      <color args={[backgroundColor]} attach="background" />
      <fog args={[fog.color, fog.near, fog.far]} attach="fog" />
      <ambientLight color={ambientFill.color} intensity={ambientFill.intensity} />
      <hemisphereLight
        args={[
          hemisphereFill.skyColor,
          hemisphereFill.groundColor,
          hemisphereFill.intensity,
        ]}
        groundColor={hemisphereFill.groundColor}
      />
      <directionalLight
        castShadow={keyLight.castShadow}
        color={keyLight.color}
        intensity={keyLight.intensity}
        position={keyLight.position}
        shadow-bias={keyLight.shadow.bias}
        shadow-camera-bottom={-keyLight.shadow.bounds}
        shadow-camera-far={keyLight.shadow.far}
        shadow-camera-left={-keyLight.shadow.bounds}
        shadow-camera-right={keyLight.shadow.bounds}
        shadow-camera-top={keyLight.shadow.bounds}
        shadow-mapSize-height={keyLight.shadow.mapSize}
        shadow-mapSize-width={keyLight.shadow.mapSize}
        shadow-normalBias={keyLight.shadow.normalBias}
        shadow-radius={keyLight.shadow.radius}
      />
      <directionalLight
        color={fillLight.color}
        intensity={fillLight.intensity}
        position={fillLight.position}
      />
      <directionalLight
        color={rimLight.color}
        intensity={rimLight.intensity}
        position={rimLight.position}
      />
    </>
  );
}
