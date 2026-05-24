"use client";

// Cesium must know where its static assets live before the Viewer is created.
if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium";
}

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  ConstantProperty,
  PointPrimitiveCollection,
  type PointPrimitive,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { twoline2satrec, propagate as sgp4Propagate } from "satellite.js";
import type { ColorLens } from "@/lib/catalog-filters";
import type { HeroObject } from "./types";

Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

type Props = {
  objects: HeroObject[];
  visibleIds: string[];
  colorLens: ColorLens;
  showAmbient: boolean;
  filterKey: string;
  onSelect: (o: HeroObject | null) => void;
};

type CloudTle = { id: string; l1: string; l2: string; t: string };

function colorForScore(score: number): Color {
  if (score < 33) return Color.fromCssColorString("#3b3b3b").withAlpha(0.9);
  if (score < 66) return Color.fromCssColorString("#ffe11f").withAlpha(0.95);
  return Color.fromCssColorString("#ff6b35").withAlpha(0.95);
}

function lensScore(obj: HeroObject, lens: ColorLens): number {
  if (lens === "collision") return obj.collision;
  if (lens === "compliance") return obj.compliance;
  if (lens === "salvage") return obj.salvage;
  return obj.composite;
}

function colorForType(t: string): Color {
  if (t === "rocket_body") return Color.fromCssColorString("#ff6b35").withAlpha(0.55);
  if (t === "fragment") return Color.fromCssColorString("#ffe11f").withAlpha(0.45);
  return Color.fromCssColorString("#ffffff").withAlpha(0.4);
}

export default function CesiumScene({
  objects,
  visibleIds,
  colorLens,
  showAmbient,
  filterKey,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // Latest filter state, read by the update effect via refs.
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const visibleRef = useRef(visibleIds);
  visibleRef.current = visibleIds;
  const lensRef = useRef(colorLens);
  lensRef.current = colorLens;
  const ambientRef = useRef(showAmbient);
  ambientRef.current = showAmbient;

  const viewerRef = useRef<Viewer | null>(null);
  const heroesRef = useRef<Map<string, { entity: Entity; obj: HeroObject }>>(
    new Map(),
  );
  const cloudRef = useRef<PointPrimitiveCollection | null>(null);
  const [cloudCount, setCloudCount] = useState(0);

  // --- Mount once: build the viewer, heroes, and ambient cloud ---
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
    viewerRef.current = viewer;

    viewer.scene.backgroundColor = Color.fromCssColorString("#0d0d0d");
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0d0d0d");
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = "none";

    const now = JulianDate.now();
    const start = JulianDate.addSeconds(now, -1800, new JulianDate());
    const stop = JulianDate.addSeconds(now, 1800, new JulianDate());
    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = now.clone();
    viewer.clock.multiplier = 60;
    viewer.clock.clockRange = ClockRange.LOOP_STOP;

    const stepSeconds = 30;
    const visibleSet = new Set(visibleRef.current);
    const heroes = heroesRef.current;
    for (const obj of objectsRef.current) {
      if (!obj.line1 || !obj.line2) continue;
      const satrec = twoline2satrec(obj.line1, obj.line2);
      if (Number(satrec.error) !== 0) continue;
      const positions = new SampledPositionProperty(ReferenceFrame.INERTIAL);
      let current = start.clone();
      let added = 0;
      while (JulianDate.lessThanOrEquals(current, stop)) {
        const r = sgp4Propagate(satrec, JulianDate.toDate(current));
        if (r && r.position && typeof r.position !== "boolean") {
          positions.addSample(
            current.clone(),
            new Cartesian3(r.position.x * 1000, r.position.y * 1000, r.position.z * 1000),
          );
          added++;
        }
        current = JulianDate.addSeconds(current, stepSeconds, new JulianDate());
      }
      if (added < 2) continue;
      const entity = viewer.entities.add({
        id: obj.id,
        name: obj.name,
        show: visibleSet.has(obj.id),
        position: positions,
        point: {
          pixelSize: 8 + (obj.composite / 100) * 6,
          color: colorForScore(lensScore(obj, lensRef.current)),
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
      heroes.set(obj.id, { entity, obj });
    }

    // Ambient cloud (full catalog) propagated in a worker.
    const cloud = viewer.scene.primitives.add(new PointPrimitiveCollection());
    cloud.show = ambientRef.current;
    cloudRef.current = cloud;
    const points: PointPrimitive[] = [];
    let worker: Worker | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const scratch = new Cartesian3();

    (async () => {
      try {
        const res = await fetch("/api/globe/tles");
        if (!res.ok || cancelled) return;
        const all = (await res.json()) as CloudTle[];
        const tles = all.filter((d) => d.l1 && d.l2 && !heroes.has(d.id));
        if (cancelled) return;
        for (const t of tles) {
          points.push(
            cloud.add({ id: t.id, position: Cartesian3.ZERO, pixelSize: 2, color: colorForType(t.t), show: false }),
          );
        }
        setCloudCount(points.length);
        worker = new Worker(new URL("./propagation.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (
          e: MessageEvent<
            { type: "ready"; count: number } | { type: "positions"; positions: Float32Array }
          >,
        ) => {
          const msg = e.data;
          if (msg.type === "ready") {
            const tick = () => {
              if (cancelled || !worker) return;
              worker.postMessage({ type: "tick", epochMs: JulianDate.toDate(viewer.clock.currentTime).getTime() });
            };
            tick();
            tickTimer = setInterval(tick, 250);
          } else if (msg.type === "positions") {
            const pos = msg.positions;
            for (let i = 0; i < points.length; i++) {
              const x = pos[i * 3];
              if (Number.isNaN(x)) {
                points[i].show = false;
                continue;
              }
              scratch.x = x;
              scratch.y = pos[i * 3 + 1];
              scratch.z = pos[i * 3 + 2];
              points[i].position = scratch;
              points[i].show = true;
            }
            viewer.scene.requestRender();
          }
        };
        worker.postMessage({ type: "init", tles });
      } catch {
        // cloud is non-critical
      }
    })();

    viewer.screenSpaceEventHandler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (picked && picked.id instanceof Entity) {
        onSelectRef.current(heroes.get(String(picked.id.id))?.obj ?? null);
      } else if (picked && typeof picked.id === "string") {
        routerRef.current.push(`/debris/${picked.id}`);
      } else {
        onSelectRef.current(null);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.flyHome(0);

    return () => {
      cancelled = true;
      if (tickTimer) clearInterval(tickTimer);
      if (worker) worker.terminate();
      heroesRef.current = new Map();
      cloudRef.current = null;
      viewerRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- React to filter changes WITHOUT recreating the viewer ---
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const visibleSet = new Set(visibleIds);
    heroesRef.current.forEach(({ entity, obj }, id) => {
      entity.show = visibleSet.has(id);
      if (entity.point) {
        entity.point.color = new ConstantProperty(
          colorForScore(lensScore(obj, colorLens)),
        );
      }
    });
    if (cloudRef.current) cloudRef.current.show = showAmbient;
    viewer.scene.requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, colorLens, showAmbient]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {cloudCount > 0 && showAmbient && (
        <div className="pointer-events-none absolute bottom-16 right-4 z-10 font-mono text-[10px] uppercase tracking-wider text-muted">
          {cloudCount.toLocaleString()} objects in cloud
        </div>
      )}
    </>
  );
}
