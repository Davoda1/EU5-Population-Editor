import { useState, useEffect, useRef } from "react";
import type { Location, MapHit } from "../types/api";
interface View {
  x: number;
  y: number;
  width: number;
  height: number;
}
function hitCaption(hit: MapHit): string {
  if (hit.locations.length > 1) return "Ambiguous RGB: " + hit.locations.join(", ");
  const label = hit.labels.join(" / ") || "Unmapped area";
  return hit.locations.length === 1 && !hit.selectable_locations.includes(hit.locations[0])
    ? label + " · Not selectable for population editing."
    : label;
}
export function MapPanel({
  location,
  onSelect,
  onError,
}: {
  location: Location;
  onSelect: (key: string) => void;
  onError: (e: unknown) => void;
}) {
  const [view, setView] = useState<View | null>(null),
    [image, setImage] = useState(""),
    [hover, setHover] = useState("");
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const ticket = useRef(0);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dimensions = location.map_dimensions;
  const center = () => {
    if (!location.region || !dimensions) return;
    const r = location.region;
    const width = Math.min(
        dimensions[0],
        Math.max(640, (r.max_x - r.min_x + 1) * 3),
      ),
      height = Math.min(
        dimensions[1],
        Math.max(360, (r.max_y - r.min_y + 1) * 3),
      );
    setView({
      x: Math.max(
        0,
        Math.min(
          dimensions[0] - width,
          Math.round((r.min_x + r.max_x - width) / 2),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          dimensions[1] - height,
          Math.round((r.min_y + r.max_y - height) / 2),
        ),
      ),
      width,
      height,
    });
  };
  useEffect(() => {
    center();
  }, [location.key, location.region?.area]);
  useEffect(() => {
    if (!view) return;
    const id = ++ticket.current;
    const timer = setTimeout(() => {
      void window.eu5
        .request<{ image: string }>("map_tile", {
          ...view,
          selected: location.key,
        })
        .then((r) => {
          if (id === ticket.current) setImage(r.image);
        })
        .catch(onError);
    }, 90);
    return () => clearTimeout(timer);
  }, [view, location.key]);
  useEffect(
    () => () => {
      if (hitTimer.current) clearTimeout(hitTimer.current);
    },
    [],
  );
  const move = (v: View) => {
    if (!dimensions) return;
    const width = Math.min(dimensions[0], Math.max(16, Math.round(v.width))),
      height = Math.min(dimensions[1], Math.max(16, Math.round(v.height)));
    setView({
      x: Math.max(0, Math.min(dimensions[0] - width, Math.round(v.x))),
      y: Math.max(0, Math.min(dimensions[1] - height, Math.round(v.y))),
      width,
      height,
    });
  };
  const zoom = (factor: number) => {
    if (view)
      move({
        x: view.x + (view.width * (1 - factor)) / 2,
        y: view.y + (view.height * (1 - factor)) / 2,
        width: view.width * factor,
        height: view.height * factor,
      });
  };
  useEffect(() => {
    const node = viewport.current;
    if (!node || !view) return;
    const wheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      // React's passive wheel listener cannot stop ancestor scrolling, which
      // can move the map out from under the pointer while the user zooms.
      event.preventDefault();
      zoom(event.deltaY < 0 ? 0.85 : 1.15);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
    // The image dependency attaches the listener when the viewport first
    // appears; view and dimensions keep its zoom calculation current.
  }, [view, image, dimensions]);
  return (
    <section className="map-panel">
      <div className="section-head">
        <h2>Location map</h2>
        <div>
          <button
            onClick={() => zoom(0.7)}
            disabled={!view}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => zoom(1.4)}
            disabled={!view}
            aria-label="Zoom out"
          >
            −
          </button>
          <button onClick={center} disabled={!location.region}>
            Center
          </button>
        </div>
      </div>
      {view && image ? (
        <div
          ref={viewport}
          className="map-viewport"
          tabIndex={0}
          role="application"
          aria-label="Location map. Arrow keys pan; plus and minus zoom."
          onKeyDown={(e) => {
            if (!view) return;
            const keys: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            if (keys[e.key]) {
              e.preventDefault();
              move({
                ...view,
                x: view.x + (keys[e.key][0] * view.width) / 5,
                y: view.y + (keys[e.key][1] * view.height) / 5,
              });
            }
            if (e.key === "+") zoom(0.7);
            if (e.key === "-") zoom(1.4);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            if (hitTimer.current) clearTimeout(hitTimer.current);
            drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerCancel={() => { drag.current = null; }}
          onLostPointerCapture={() => { drag.current = null; }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (
              d &&
              !d.moved &&
              Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 5
            ) {
              const box = e.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(dimensions![0] - 1, Math.floor(
                  view.x + ((e.clientX - box.left) / box.width) * view.width,
                ))),
                y = Math.max(0, Math.min(dimensions![1] - 1, Math.floor(
                  view.y + ((e.clientY - box.top) / box.height) * view.height,
                )));
              void window.eu5
                .request<MapHit>("map_hit", {
                  x,
                  y,
                })
                .then((r) => {
                  setHover(hitCaption(r));
                  if (r.locations.length === 1 && r.selectable_locations.includes(r.locations[0]))
                    onSelect(r.locations[0]);
                })
                .catch(onError);
            }
          }}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            if (drag.current) {
              const d = drag.current;
              if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) >= 5)
                d.moved = true;
              move({
                ...d.view,
                x: d.view.x - ((e.clientX - d.x) / box.width) * d.view.width,
                y: d.view.y - ((e.clientY - d.y) / box.height) * d.view.height,
              });
              return;
            }
            if (hitTimer.current) clearTimeout(hitTimer.current);
            const x = Math.max(0, Math.min(dimensions![0] - 1, Math.floor(
                view.x + ((e.clientX - box.left) / box.width) * view.width,
              ))),
              y = Math.max(0, Math.min(dimensions![1] - 1, Math.floor(
                view.y + ((e.clientY - box.top) / box.height) * view.height,
              )));
            hitTimer.current = setTimeout(() => {
              void window.eu5
                .request<MapHit>("map_hit", {
                  x,
                  y,
                })
                .then((r) => setHover(hitCaption(r)))
                .catch(() => {});
            }, 130);
          }}
        >
          <img
            src={image}
            draggable={false}
            alt={`Indexed location map around ${location.name}`}
          />
          <div className="map-caption">
            {hover || location.key} · drag to pan · scroll to zoom
          </div>
        </div>
      ) : (
        <div className="empty map-empty">
          {dimensions
            ? "No unambiguous indexed region for this location."
            : "Use “Index map” to prepare the location map."}
        </div>
      )}
      <p className="hint">
        Selected location: gold. Water: blue. Corridors and impassable land: dark grey.
        Borders, drag and zoom remain available across all tiles. Country colors are
        deterministic fallbacks; shared RGB identifiers are reported rather than guessed.
      </p>
    </section>
  );
}
