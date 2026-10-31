export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowGeometry {
  // Older preferences contain only the normal window dimensions.
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface Preferences {
  theme: "auto" | "light" | "dark";
  gameDir: string;
  projectDir: string;
  exportDir: string;
  autoLoad: boolean;
  rememberWindow: boolean;
  rememberFolders: boolean;
  geometry: WindowGeometry | null;
}

export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 920 };
export const MIN_WINDOW_SIZE = { width: 960, height: 680 };

export function defaultPreferences(): Preferences {
  return {
    theme: "auto",
    gameDir: "",
    projectDir: "",
    exportDir: "",
    autoLoad: true,
    rememberWindow: true,
    rememberFolders: true,
    geometry: null,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function dimension(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100000
    ? Math.round(value)
    : undefined;
}

function coordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1000000
    ? Math.round(value)
    : undefined;
}

function path(value: unknown): string {
  return typeof value === "string" && value.length <= 32768 && !/[\u0000-\u001f]/.test(value)
    ? value.trim()
    : "";
}

function geometry(value: unknown): WindowGeometry | null {
  const saved = record(value);
  if (!saved) return null;
  const width = dimension(saved.width), height = dimension(saved.height);
  if (!width || !height) return null;
  const result: WindowGeometry = { width, height, maximized: saved.maximized === true };
  const x = coordinate(saved.x), y = coordinate(saved.y);
  if (x !== undefined && y !== undefined) Object.assign(result, { x, y });
  return result;
}

/** Migrate saved preferences without accepting malformed paths or window data. */
export function readPreferences(value: unknown): Preferences {
  const result = defaultPreferences(), saved = record(value);
  if (!saved) return result;
  if (saved.theme === "auto" || saved.theme === "light" || saved.theme === "dark")
    result.theme = saved.theme;
  result.gameDir = path(saved.gameDir);
  for (const name of ["autoLoad", "rememberWindow", "rememberFolders"] as const) {
    if (typeof saved[name] === "boolean") result[name] = saved[name];
  }
  if (result.rememberFolders) {
    result.projectDir = path(saved.projectDir);
    result.exportDir = path(saved.exportDir);
  }
  if (result.rememberWindow) {
    if (Object.hasOwn(saved, "geometry")) result.geometry = geometry(saved.geometry);
    else if (dimension(saved.width) || dimension(saved.height)) {
      result.geometry = {
        width: dimension(saved.width) ?? DEFAULT_WINDOW_SIZE.width,
        height: dimension(saved.height) ?? DEFAULT_WINDOW_SIZE.height,
        maximized: false,
      };
    }
  }
  return result;
}

function intersection(a: WindowBounds, b: WindowBounds): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/** Electron screen work areas and BrowserWindow bounds use device-independent pixels. */
export function windowBounds(
  saved: WindowGeometry | null,
  workAreas: WindowBounds[],
  primary: WindowBounds,
): WindowBounds {
  let area = primary;
  let positioned = false;
  if (saved?.x !== undefined && saved.y !== undefined) {
    const previous = { ...saved, x: saved.x, y: saved.y };
    let largest = 0;
    for (const candidate of workAreas) {
      const overlap = intersection(previous, candidate);
      if (overlap > largest) {
        largest = overlap;
        area = candidate;
        positioned = true;
      }
    }
  }
  const width = Math.min(area.width, Math.max(MIN_WINDOW_SIZE.width, saved?.width ?? DEFAULT_WINDOW_SIZE.width));
  const height = Math.min(area.height, Math.max(MIN_WINDOW_SIZE.height, saved?.height ?? DEFAULT_WINDOW_SIZE.height));
  const x = positioned ? saved!.x! : area.x + (area.width - width) / 2;
  const y = positioned ? saved!.y! : area.y + (area.height - height) / 2;
  return {
    width: Math.round(width),
    height: Math.round(height),
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
  };
}
