export const methods = [
  "draft_activity",
  "load_game",
  "new_project",
  "status",
  "select",
  "locations",
  "location",
  "preview",
  "discard",
  "apply",
  "undo",
  "redo",
  "save",
  "open",
  "validate",
  "export",
  "change_report",
  "import_mod_plan",
  "legacy_plan",
  "legacy_commit",
  "upgrade_plan",
  "upgrade_resolve",
  "upgrade_acknowledge",
  "upgrade_commit",
  "upgrade_report",
  "map_index",
  "map_tile",
  "map_hit",
] as const;
export type Method = (typeof methods)[number];
export type Params = Record<string, unknown>;
export interface GameVersionPreference {
  version: string;
  source: "manual";
}
export type ConfirmationAction = "cancel" | "discard" | "save";
export interface ConfirmationPrompt {
  token: string;
  reason: "replace" | "exit" | "restart";
  hasDrafts: boolean;
  canSave: boolean;
  unavailable: boolean;
  error: string;
}
export type ExternalDestination = "repository" | "issues" | "manual";
export interface Bridge {
  request<T = unknown>(method: Method, params?: Params): Promise<T>;
  preferences(
    theme?: "auto" | "light" | "dark",
  ): Promise<{ theme: "auto" | "light" | "dark" }>;
  gameVersion(value?: string): Promise<GameVersionPreference>;
  restart(): Promise<boolean>;
  openLink(destination: ExternalDestination): Promise<void>;
  respondConfirmation(token: string, action: ConfirmationAction): Promise<void>;
  onEvent(
    fn: (event: { event: string; data: Record<string, unknown> }) => void,
  ): () => void;
}
export interface Row {
  type: string;
  culture: string;
  religion: string;
  size: string;
}
export interface MapHit {
  locations: string[];
  labels: string[];
  selectable_locations: string[];
  kinds: ("land" | "sea" | "lake" | "impassable" | "non_ownable")[];
}
export interface Location {
  key: string;
  name: string;
  owners: string[] | null;
  original: Record<string, Row>;
  working: Record<string, Row>;
  draft: Record<string, Row> | null;
  original_total: string;
  working_total: string;
  draft_total: string | null;
  draft_token: number | null;
  region: {
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;
    area: number;
    sum_x: number;
    sum_y: number;
  } | null;
  map_dimensions: [number, number] | null;
}
export interface Status {
  fingerprint: string;
  compatible: boolean;
  dirty: boolean;
  modified: number;
  drafts: number;
  undo: boolean;
  redo: boolean;
  countries: { tag: string; name: string; count: number }[];
  definitions: { culture: string[]; religion: string[]; type: string[] };
  map_available: boolean;
  map_indexed: boolean;
  selected_country: string;
  selected_location: string;
}
export interface LocationList {
  total: number;
  items: { key: string; name: string; modified: boolean; draft: boolean }[];
}
export interface Issue {
  severity: string;
  file: string;
  location: string | null;
  message: string;
  feature: string;
  resolution: string;
}
export interface MigrationItem {
  location: string;
  classification: string;
  old_vanilla: Row[];
  old_modified: Row[];
  new_vanilla: Row[];
  proposal: Row[] | null;
  old_total: string;
  new_total: string;
  ratio: string | null;
  resolution: string | null;
}
export interface MigrationPlan {
  items: MigrationItem[];
  new_locations: string[];
  removed_locations: string[];
  ownership_changes: Record<string, [string[], string[]]>;
  tag_candidates: {
    old_tag: string;
    ambiguous: boolean;
    candidates: [string, number, boolean][];
  }[];
  confirmed_tag_mappings: Record<string, string>;
  acknowledged_topology: boolean;
}
declare global {
  interface Window {
    eu5: Bridge;
  }
}
