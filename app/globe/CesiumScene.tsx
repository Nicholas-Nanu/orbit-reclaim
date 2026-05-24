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
  IonImageryProvider,
  PointPrimitiveCollection,
  PolylineCollection,
  Material,
  Math as CesiumMath,
  HeadingPitchRange,
  type PointPrimitive,
  type Polyline,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  twoline2satrec,
  propagate as sgp4Propagate,
  eciToEcf,
  gstime,
} from "satellite.js";
import type { ColorLens } from "@/lib/catalog-filters";
import type { HeroObject } from "./types";

Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

type Props = {
  objects: HeroObject[];
  visibleIds: string[];
  colorLens: ColorLens;
  showAmbient: boolean;
  filterKey: string;
  selectedId: string | null;
  onSelect: (o: HeroObject | null) => void;
  onReady?: (api: SceneApi) => void;
};

export type SceneApi = {
  focusObject: (id: string) => void;
  clearFocus: () => void;
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
  selectedId,
  onSelect,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
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
  const drawOrbitRef = useRef<(obj: HeroObject) => void>(() => {});
  const clearOrbitRef = useRef<() => void>(() => {});
  const skipIntroRef = useRef<() => void>(() => {});
  const [cloudCount, setCloudCount] = useState(0);
  const [introPlaying, setIntroPlaying] = useState(false);

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

    // Prefer NASA "Earth at Night" (Black Marble, Ion asset 3812) for the
    // night-lights look. If the Ion account can't access that asset, fall back
    // to the default imagery, dimmed for a moodier on-brand night look.
    (async () => {
      try {
        const nightProvider = await IonImageryProvider.fromAssetId(3812);
        if (viewer.isDestroyed()) return;
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(nightProvider);
      } catch {
        const base = viewer.imageryLayers.get(0);
        if (base) {
          base.brightness = 0.45;
          base.saturation = 0.55;
          base.gamma = 0.75;
        }
      }
    })();

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

    // --- Selected-object orbit ring (one full period, single ECEF snapshot) ---
    const orbitLines = viewer.scene.primitives.add(new PolylineCollection());
    let currentOrbit: Polyline | null = null;
    const clearOrbit = () => {
      if (currentOrbit) {
        orbitLines.remove(currentOrbit);
        currentOrbit = null;
        viewer.scene.requestRender();
      }
    };
    const drawOrbitFor = (obj: HeroObject) => {
      clearOrbit();
      if (!obj.line1 || !obj.line2) return;
      const satrec = twoline2satrec(obj.line1, obj.line2);
      if (Number(satrec.error) !== 0) return;
      const periodMin = (2 * Math.PI) / satrec.no;
      if (!Number.isFinite(periodMin) || periodMin <= 0) return;
      const startMs = Date.now();
      const gmst = gstime(new Date(startMs)); // one rotation for the whole ring
      const samples = 256;
      const ring: Cartesian3[] = [];
      for (let i = 0; i <= samples; i++) {
        const r = sgp4Propagate(
          satrec,
          new Date(startMs + periodMin * 60_000 * (i / samples)),
        );
        if (r && r.position && typeof r.position !== "boolean") {
          const e = eciToEcf(r.position, gmst);
          ring.push(new Cartesian3(e.x * 1000, e.y * 1000, e.z * 1000));
        }
      }
      if (ring.length < 2) return;
      ring.push(ring[0]);
      currentOrbit = orbitLines.add({
        positions: ring,
        width: 2.5,
        material: Material.fromType("Color", {
          color: Color.fromCssColorString("#ffe11f").withAlpha(0.75),
        }),
      });
      viewer.scene.requestRender();
    };
    drawOrbitRef.current = drawOrbitFor;
    clearOrbitRef.current = clearOrbit;

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

    // --- Cinematic intro on first load (once per tab) ---
    const INTRO_KEY = "orbit-reclaim-intro-played";
    const shouldPlayIntro =
      typeof window !== "undefined" && !sessionStorage.getItem(INTRO_KEY);
    const finalView = {
      destination: Cartesian3.fromDegrees(-60, 15, 12_000_000),
      orientation: {
        heading: CesiumMath.toRadians(45),
        pitch: CesiumMath.toRadians(-25),
        roll: 0,
      },
    };
    const flyToAsync = (
      options: Parameters<typeof viewer.camera.flyTo>[0],
    ): Promise<void> =>
      new Promise((resolve) => {
        viewer.camera.flyTo({
          ...options,
          complete: () => resolve(),
          cancel: () => resolve(),
        });
      });
    const skipIntro = () => {
      if (viewer.isDestroyed()) return;
      viewer.camera.cancelFlight();
      viewer.camera.setView(finalView);
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      setIntroPlaying(false);
    };
    skipIntroRef.current = skipIntro;

    if (shouldPlayIntro) {
      setIntroPlaying(true);
      sessionStorage.setItem(INTRO_KEY, "1");
      viewer.scene.screenSpaceCameraController.enableInputs = false;
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(0, 90, 35_000_000),
        orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
      });
      (async () => {
        await new Promise((r) => setTimeout(r, 200));
        if (cancelled) return;
        await flyToAsync({
          destination: Cartesian3.fromDegrees(-30, 25, 18_000_000),
          orientation: {
            heading: CesiumMath.toRadians(20),
            pitch: CesiumMath.toRadians(-35),
            roll: 0,
          },
          duration: 3.5,
        });
        if (cancelled) return;
        await flyToAsync({ ...finalView, duration: 2.5 });
      })().finally(() => {
        if (cancelled || viewer.isDestroyed()) return;
        viewer.scene.screenSpaceCameraController.enableInputs = true;
        setIntroPlaying(false);
      });
    } else {
      viewer.camera.flyHome(0);
    }

    // --- Imperative API for the auto-tour cycler (POLISH-4) ---
    onReadyRef.current?.({
      focusObject: (id: string) => {
        const hero = heroesRef.current.get(id);
        if (!hero) return;
        onSelectRef.current(hero.obj); // selection -> orbit ring via the selectedId effect
        viewer.flyTo(hero.entity, {
          duration: 1.5,
          offset: new HeadingPitchRange(0, -Math.PI / 4, 8_000_000),
        });
      },
      clearFocus: () => {
        viewer.camera.cancelFlight();
        onSelectRef.current(null);
      },
    });

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

  // --- Draw the orbit ring for the selected hero (clear when deselected) ---
  useEffect(() => {
    if (!viewerRef.current) return;
    const hero = selectedId ? heroesRef.current.get(selectedId) : undefined;
    if (hero) drawOrbitRef.current(hero.obj);
    else clearOrbitRef.current();
  }, [selectedId]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {introPlaying && (
        <button
          type="button"
          onClick={() => skipIntroRef.current()}
          className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-sm border border-border bg-surface/90 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted backdrop-blur hover:text-text"
        >
          Skip intro →
        </button>
      )}
      {cloudCount > 0 && showAmbient && (
        <div className="pointer-events-none absolute bottom-16 right-4 z-10 font-mono text-[10px] uppercase tracking-wider text-muted">
          {cloudCount.toLocaleString()} objects in cloud
        </div>
      )}
    </>
  );
}
