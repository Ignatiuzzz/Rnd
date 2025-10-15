// src/events.ts

// ----- Tipos de tablas / resúmenes que usamos en los sims -----
export type TableColumn = { key: string; label: string; align?: "left" | "right" | "center" };
export type ParamRow = { label: string; value: string | number };
export type SummarySpec = { title?: string; rows: ParamRow[] };

// ----- Eventos que emiten los simuladores -----
export type SimEvent =
  | { type: "info"; message?: string; panel?: "params"; data?: ParamRow[] }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "step"; name: "table:init"; data: { title?: string; columns: TableColumn[] } }
  | { type: "step"; name: "table:row"; data: Record<string, any> }
  | { type: "done"; summary?: Record<string, any>; summaryFriendly?: SummarySpec };

// ----- Esquema de inputs -----
export type InputSchemaField =
  | { key: string; label: string; type: "int" | "float"; defaultValue?: number }
  | { key: string; label: string; type: "string"; defaultValue?: string };

// ----- Metadatos opcionales para preview/detalles en la UI -----
export type SpecExtras = {
  details?: string[];
  tablePreview?: { title?: string; columns: TableColumn[] };
};

// ----- RunnerSpec (ahora incluye p1 y p2) -----
export type RunnerSpec = {
  id: "p1" | "p2" | "p3" | "p4" | "p5" | "p6";
  title: string;
  description: string;
  inputs: InputSchemaField[];
  run: (params: Record<string, any>, emit: (e: SimEvent) => void) => Promise<void>;
} & SpecExtras;
