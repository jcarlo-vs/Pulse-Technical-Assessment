"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { Glance, PeerDot } from "@/lib/types";
import { LocateIcon } from "./icons";
import { vibeOf } from "@/lib/vibes";
import { currentTheme, THEME_EVENT } from "@/lib/theme";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const SPIN_DEG_PER_SEC = 3;

// Recolour the stock dark style to the current theme (lib/theme.ts): land,
// oceans, borders and labels, so the globe never looks like a flat grey
// ball. Matched by layer type/id so it survives Mapbox renaming layers.
function tintGlobe(map: MapboxMap) {
  const { globe: GLOBE, fog } = currentTheme();
  map.setFog({
    color: fog.color,
    "high-color": fog.high,
    "horizon-blend": 0.025,
    "space-color": fog.space,
    "star-intensity": 0.7,
  });
  const paint = map.setPaintProperty.bind(map) as (id: string, p: string, v: string) => void;
  const set = (id: string, prop: string, value: string) => {
    try {
      paint(id, prop, value);
    } catch {}
  };
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type === "background") set(l.id, "background-color", GLOBE.land);
    else if (l.type === "fill") {
      set(l.id, "fill-color", /water/.test(l.id) ? GLOBE.water : GLOBE.landShade);
    } else if (l.type === "line") {
      if (/water/.test(l.id)) set(l.id, "line-color", GLOBE.water);
      else if (/admin|boundary/.test(l.id)) set(l.id, "line-color", GLOBE.border);
      else set(l.id, "line-color", GLOBE.road);
    } else if (l.type === "symbol") {
      set(l.id, "text-color", GLOBE.label);
      set(l.id, "text-halo-color", GLOBE.water);
    }
  }
}

export default function WorldMap({
  peers,
  me,
  myVibe,
  onPeerClick,
  canConnect,
  focus,
  preview,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  myVibe: string;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
  // Fly here when it changes (used by "Find someone").
  focus?: { lat: number; lng: number } | null;
  // Coarse live activity shown on the entry screen, before joining.
  preview?: Glance["spots"];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const spinRef = useRef(true);
  const spotsRef = useRef<Map<string, Marker>>(new Map());
  const [ready, setReady] = useState(false);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  // Initialise the globe once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        projection: "globe",
        center: [100, 18],
        zoom: window.innerWidth < 768 ? 0.9 : 1.6,
        attributionControl: false,
      });
      // Until the user lands, keep the globe clear of the entry panel
      // (right half on desktop, bottom sheet on phones).
      const desktop = window.innerWidth >= 768;
      map.setPadding(
        desktop
          ? { top: 0, bottom: 0, left: 0, right: Math.min(560, window.innerWidth * 0.45) }
          : { top: 0, left: 0, right: 0, bottom: window.innerHeight * 0.55 },
      );
      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-right",
      );

      map.on("style.load", () => tintGlobe(map));
      const retint = () => tintGlobe(map);
      window.addEventListener(THEME_EVENT, retint);
      map.on("remove", () => window.removeEventListener(THEME_EVENT, retint));

      // Idle rotation until the user lands (or touches the globe).
      const spin = () => {
        if (!spinRef.current || reduceMotion || map.getZoom() > 4) return;
        const center = map.getCenter();
        center.lng -= SPIN_DEG_PER_SEC;
        map.easeTo({ center, duration: 1000, easing: (n) => n });
      };
      const stopSpin = () => {
        spinRef.current = false;
      };
      map.on("mousedown", stopSpin);
      map.on("touchstart", stopSpin);
      map.on("wheel", stopSpin);
      map.on("moveend", spin);

      map.on("load", () => {
        if (cancelled) return;
        setReady(true);
        spin();
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Land on the user: stop spinning, fly in, drop the "you" beacon.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        spinRef.current = false;
        map.flyTo({
          center: [me.lng, me.lat],
          zoom: 4.5,
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
          speed: 0.9,
          curve: 1.6,
          essential: true,
        });
        const el = document.createElement("div");
        el.className = "me";
        el.title = "You. Others see your dot here, 1-3 km from your real location.";
        el.innerHTML = `<span class="me-label">You ${vibeOf(myVibe).emoji}</span><span class="me-core"></span>`;
        meMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
    // myVibe is fixed for the session once `me` is set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          const vibe = vibeOf(peer.vibe);
          el.className = "dot is-new";
          el.style.setProperty("--c", vibe.color);
          // Desync the ring animations so the map breathes, not blinks.
          el.style.setProperty("--d", `${(Math.random() * 2.6).toFixed(2)}s`);
          el.innerHTML = `<span class="busy-tag">In a call</span><span class="dot-core">${vibe.emoji}</span>`;
          el.dataset.vibe = vibe.label;
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (el.classList.contains("is-busy")) return;
            if (canConnectRef.current) onPeerClickRef.current(peer.id);
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        const el = marker.getElement();
        el.classList.toggle("is-busy", peer.busy);
        const label = peer.busy
          ? `Stranger feeling ${el.dataset.vibe} (in a conversation)`
          : `Stranger feeling ${el.dataset.vibe}, tap to connect`;
        el.title = label;
        el.setAttribute("aria-label", label);
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  // Entry-screen activity: decorative, non-interactive markers that animate
  // by status (available / in a call / waiting for an answer).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    const spots = spotsRef.current;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const seen = new Set<string>();
      for (const s of preview ?? []) {
        const key = `${s.lat},${s.lng},${s.s}`;
        seen.add(key);
        if (spots.has(key)) continue;
        const el = document.createElement("div");
        el.className = `spot spot-${s.s}`;
        el.setAttribute("aria-hidden", "true");
        el.style.setProperty("--d", `${(Math.random() * 2.4).toFixed(2)}s`);
        spots.set(key, new mapboxgl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map));
      }
      for (const [key, m] of spots) {
        if (!seen.has(key)) {
          m.remove();
          spots.delete(key);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, ready]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
    spinRef.current = false;
    mapRef.current.flyTo({ center: [focus.lng, focus.lat], zoom: 5, essential: true });
  }, [focus]);

  function recenter() {
    if (mapRef.current && me) {
      mapRef.current.flyTo({ center: [me.lng, me.lat], zoom: 4.5, essential: true });
    }
  }

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-bg" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="glass max-w-md rounded-2xl p-4 text-sm text-ink-dim">
            Set <code className="text-accent">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      {me && (
        <button
          onClick={recenter}
          aria-label="Center on my location"
          title="Center on me"
          className="glass btn-ghost absolute bottom-40 left-4 z-10 grid size-10 place-items-center rounded-full md:bottom-8 md:size-11"
        >
          <LocateIcon />
        </button>
      )}
    </div>
  );
}
