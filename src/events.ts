// src/events.ts

export type SimEvent =
  | { type: "info"; message: string }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "step"; name: string; data?: Record<string, any> }
  | { type: "done"; summary?: Record<string, any> };

export type InputSchemaField =
  | { key: string; label: string; type: "int" | "float"; defaultValue?: number }
  | { key: string; label: string; type: "string"; defaultValue?: string };

export type RunnerSpec = {
  id: "p3" | "p4" | "p5" | "p6";
  title: string;
  description: string;
  inputs: InputSchemaField[];
  run: (params: Record<string, any>, emit: (e: SimEvent) => void) => Promise<void>;
};
