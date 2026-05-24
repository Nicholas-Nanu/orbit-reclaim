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
  PointPrimitiveCollection,
  type PointPrimitive,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { twoline2satrec, propagate as sgp4Propagate } from "satellite.js";
import type { HeroObject } from "./types";

Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

type Props = {
  objects: HeroObject[];
  onSelect: (o: HeroObject | null) => void;
};

type CloudTle = { id: string; l1: string; l2: string; t: string };

function colorForScore(score: number): Color {
  if (score < 33) return Color.fromCssColorString("#3b3b3b").withAlpha(0.9);
  if (score < 66) return Color.fromCssColorString("#ffe11f").withAlpha(0.95);
  return Color.fromCssColorString("#ff6b35").withAlpha(0.95);
}

function colorForType(t: string): Color {
  if (t === "rocket_body") return Color.fromCssColorString("#ff6b35").withAlpha(0.55);
  if (t === "fragment") return Color.fromCssColorString("#ffe11f").withAlpha(0.45);
  return Color.fromCssColorString("#ffffff").withAlpha(0.4); // payloads / other
}

export default function CesiumScene({ objects, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const cloudRef = useRef<PointPrimitiveCollection | null>(null);
  const [cloudOn, setCloudOn] = useState(true);
  const [cloudCount, setCloudCount] = useState(0);

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

    // --- Hero objects: smooth interpolated orbits (ECI) ---
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
            new Cartesian3(result.position.x * 1000, result.position.y * 1000, result.position.z * 1000),
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

    // --- Ambient cloud: the full catalog, propagated in a worker (ECEF) ---
    const cloud = viewer.scene.primitives.add(new PointPrimitiveCollection());
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
            cloud.add({
              id: t.id,
              position: Cartesian3.ZERO,
              pixelSize: 2,
              color: colorForType(t.t),
              show: false,
            }),
          );
        }
        setCloudCount(points.length);

        worker = new Worker(
          new URL("./propagation.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (
          e: MessageEvent<
            | { type: "ready"; count: number }
            | { type: "positions"; positions: Float32Array }
          >,
        ) => {
          const msg = e.data;
          if (msg.type === "ready") {
            const tick = () => {
              if (cancelled || !worker) return;
              const epochMs = JulianDate.toDate(viewer.clock.currentTime).getTime();
              worker.postMessage({ type: "tick", epochMs });
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
              points[i].show = cloud.show;
            }
            viewer.scene.requestRender();
          }
        };
        worker.postMessage({ type: "init", tles });
      } catch {
        // Cloud is a non-critical enhancement; heroes still render.
      }
    })();

    // --- Click: hero entity -> panel; ambient point -> detail page ---
    viewer.screenSpaceEventHandler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (picked && picked.id instanceof Entity) {
        onSelectRef.current(heroes.get(String(picked.id.id)) ?? null);
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
      cloudRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, [objects]);

  function toggleCloud() {
    const next = !cloudOn;
    setCloudOn(next);
    if (cloudRef.current) cloudRef.current.show = next;
  }

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={toggleCloud}
          className={`rounded-sm border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            cloudOn
              ? "border-gold bg-gold/10 text-gold"
              : "border-border text-muted hover:text-text"
          }`}
        >
          Catalog cloud {cloudOn ? "on" : "off"}
        </button>
        {cloudCount > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {cloudCount.toLocaleString()} objects in cloud
          </span>
        )}
      </div>
    </>
  );
}
