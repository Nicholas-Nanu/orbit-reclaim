"use client";

// Cesium must know where its static assets live before the Viewer is created.
if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium";
}

import { useEffect, useRef } from "react";
import {
  Viewer,
  Cartesian2,
  Cartesian3,
  Color,
  Ion,
  JulianDate,
  ClockRange,
  SampledPositionProperty,
  ReferenceFrame,
  ScreenSpaceEventType,
  Entity,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { twoline2satrec, propagate as sgp4Propagate } from "satellite.js";
import type { HeroObject } from "./types";

Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

type Props = {
  objects: HeroObject[];
  onSelect: (o: HeroObject | null) => void;
};

function colorForScore(score: number): Color {
  if (score < 33) return Color.fromCssColorString("#3b3b3b").withAlpha(0.9);
  if (score < 66) return Color.fromCssColorString("#ffe11f").withAlpha(0.95);
  return Color.fromCssColorString("#ff6b35").withAlpha(0.95);
}

export default function CesiumScene({ objects, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep latest onSelect without re-running the heavy effect.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current) return;
    (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium";

    const viewer = new Viewer(containerRef.current, {
      animation: true,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: true,
      shouldAnimate: true,
      contextOptions: { webgl: { alpha: true } },
    });

    // Dark, space-tech tuning.
    viewer.scene.backgroundColor = Color.fromCssColorString("#0d0d0d");
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0d0d0d");
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
    creditContainer.style.display = "none";

    // Animate ±30 min around now at 60×.
    const now = JulianDate.now();
    const start = JulianDate.addSeconds(now, -1800, new JulianDate());
    const stop = JulianDate.addSeconds(now, 1800, new JulianDate());
    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = now.clone();
    viewer.clock.multiplier = 60;
    viewer.clock.clockRange = ClockRange.LOOP_STOP;

    const stepSeconds = 30;
    const heroes = new Map<string, HeroObject>();

    for (const obj of objects) {
      if (!obj.line1 || !obj.line2) continue;
      const satrec = twoline2satrec(obj.line1, obj.line2);
      if (Number(satrec.error) !== 0) continue;

      const positions = new SampledPositionProperty(ReferenceFrame.INERTIAL);
      let current = start.clone();
      let added = 0;
      while (JulianDate.lessThanOrEquals(current, stop)) {
        const result = sgp4Propagate(satrec, JulianDate.toDate(current));
        if (result && result.position && typeof result.position !== "boolean") {
          positions.addSample(
            current.clone(),
            new Cartesian3(
              result.position.x * 1000,
              result.position.y * 1000,
              result.position.z * 1000,
            ),
          );
          added++;
        }
        current = JulianDate.addSeconds(current, stepSeconds, new JulianDate());
      }
      if (added < 2) continue;

      viewer.entities.add({
        id: obj.id,
        name: obj.name,
        position: positions,
        point: {
          pixelSize: 8 + (obj.composite / 100) * 6,
          color: colorForScore(obj.composite),
          outlineColor: Color.fromCssColorString("#ffe11f"),
          outlineWidth: 1.5,
        },
        label: {
          text: obj.name,
          font: '11px "JetBrains Mono", monospace',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString("#161616").withAlpha(0.85),
          pixelOffset: new Cartesian2(0, -18),
        },
      });
      heroes.set(obj.id, obj);
    }

    const handler = viewer.screenSpaceEventHandler;
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      const entity: Entity | undefined =
        picked && picked.id instanceof Entity ? picked.id : undefined;
      const hit = entity ? heroes.get(String(entity.id)) : undefined;
      onSelectRef.current(hit ?? null);
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.flyHome(0);

    return () => {
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, [objects]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
