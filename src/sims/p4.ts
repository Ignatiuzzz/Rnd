// client/src/sims/p4.ts
import type { RunnerSpec } from "../events";

/**
 * Simulación de tienda (llegadas por hora ~ U{0..4})
 * PMF artículos/cliente: 0:0.2, 1:0.3, 2:0.4, 3:0.1
 * Imprime:
 *  - Parámetros (bloque legible)
 *  - Tabla por hora (Clientes, Artículos, Ingreso, Costo Var, Ganancia)
 *  - Resumen final (tabla)
 */

/* ---------- RNG con semilla ---------- */
function strToSeed(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function makeLCG(seedNum: number) {
  let x = (seedNum >>> 0) || 123456789;
  const a = 1664525, c = 1013904223, m = 2 ** 32;
  return {
    next() { x = (Math.imul(a, x) + c) >>> 0; return x / m; }, // [0,1)
    randint(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
  };
}

/* ---------- PMF artículos por cliente ---------- */
function sampleArticulos(u: number): number {
  // 0:0.2, 1:0.3, 2:0.4, 3:0.1
  if (u < 0.2) return 0;
  if (u < 0.5) return 1;
  if (u < 0.9) return 2;
  return 3;
}

/* ---------- helpers de formato ---------- */
const money = (v: number) => v.toFixed(2).padStart(10);
const intw = (v: number, w = 4) => String(v).padStart(w);
const sep = (len = 86) => "─".repeat(len);
const padR = (s: string, w: number) => (s + " ".repeat(w)).slice(0, w);

export const simP4: RunnerSpec = {
  id: "p4",
  title: "P4 - Tienda (llegadas uniformes 0..4 por hora)",
  description:
    "Simula H horas con clientes por hora ~ U{0..4}. Cada cliente compra 0..3 artículos según PMF.",
  inputs: [
    { key: "H",           label: "Horas del día (H)",            type: "int",   defaultValue: 8   },
    { key: "costo_fijo",  label: "Costo fijo diario (Bs)",       type: "float", defaultValue: 300 },
    { key: "costo",       label: "Costo por artículo (Bs)",      type: "float", defaultValue: 50  },
    { key: "precio",      label: "Precio de venta (Bs)",         type: "float", defaultValue: 75  },
    { key: "seed",        label: "Semilla RNG (opcional)",       type: "string", defaultValue: "" },
  ],
  async run(params, emit) {
    // -------- leer/validar -----------
    const H           = Number.isFinite(+params.H)          && +params.H > 0 ? Math.floor(+params.H) : 8;
    const costo_fijo  = Number.isFinite(+params.costo_fijo) ? +params.costo_fijo : 300;
    const costo       = Number.isFinite(+params.costo)      ? +params.costo : 50;
    const precio      = Number.isFinite(+params.precio)     ? +params.precio : 75;
    const seedStr     = String(params.seed ?? "").trim();
    const rng = seedStr ? makeLCG(strToSeed(seedStr)) : makeLCG((Math.random() * 1e9) >>> 0);

    // -------- estado -----------
    let totClientes = 0;
    let totArt = 0;
    let ingreso = 0;
    let costoVar = 0;

    // -------- parámetros= ----------
    emit({ type: "stdout", line: "╔══════════════════════════════════════════════════════════════╗" });
    emit({ type: "stdout", line: "║                PARÁMETROS DE LA SIMULACIÓN                   ║" });
    emit({ type: "stdout", line: "╚══════════════════════════════════════════════════════════════╝" });
    emit({ type: "stdout", line: `• Horas del día (H)          : ${H}` });
    emit({ type: "stdout", line: `• Costo fijo diario (Bs)     : ${costo_fijo}` });
    emit({ type: "stdout", line: `• Costo por artículo (Bs)    : ${costo}` });
    emit({ type: "stdout", line: `• Precio de venta (Bs)       : ${precio}` });
    emit({ type: "stdout", line: `• Semilla RNG                 : ${seedStr === "" ? "aleatoria" : `"${seedStr}" (determinista)"`}` });
    emit({ type: "stdout", line: "" });

    // -------- cabecera tabla por hora ----------
    const header =
      padR("HORA", 6) + " | " +
      padR("CLIENTES", 9) + " | " +
      padR("ARTÍCULOS", 10) + " | " +
      padR("INGRESO (Bs)", 13) + " | " +
      padR("COSTO VAR (Bs)", 15) + " | " +
      padR("GANANCIA (Bs)", 14);
    emit({ type: "stdout", line: header });
    emit({ type: "stdout", line: sep(header.length) });

    // -------- simulación por horas ----------
    for (let h = 1; h <= H; h++) {
      const clientes = rng.randint(0, 4);
      let artHora = 0;
      let ingresoHora = 0;
      let costoVarHora = 0;

      for (let c = 1; c <= clientes; c++) {
        const x = sampleArticulos(rng.next());
        artHora += x;
      }

      // registrar totales de la hora
      const ganHora = artHora * (precio - costo);
      ingresoHora = artHora * precio;
      costoVarHora = artHora * costo;

      // acumular día
      totClientes += clientes;
      totArt += artHora;
      ingreso += ingresoHora;
      costoVar += costoVarHora;

      const line =
        padR(intw(h), 6) + " | " +
        padR(intw(clientes), 9) + " | " +
        padR(intw(artHora), 10) + " | " +
        padR(money(ingresoHora), 13) + " | " +
        padR(money(costoVarHora), 15) + " | " +
        padR(money(ganHora), 14);

      emit({ type: "stdout", line });
    }

    emit({ type: "stdout", line: sep(header.length) });

    const ganancia = ingreso - costoVar - costo_fijo;

    // -------- resumen (tabla compacta) ----------
    emit({ type: "stdout", line: "" });
    emit({ type: "stdout", line: "╔════════════════════════════════════════╗" });
    emit({ type: "stdout", line: "║            RESUMEN DEL DÍA             ║" });
    emit({ type: "stdout", line: "╚════════════════════════════════════════╝" });

    const L = 34;
    const row = (k: string, v: string) =>
      `• ${padR(k + ":", L)} ${v}`;

    emit({ type: "stdout", line: row("Horas simuladas", String(H)) });
    emit({ type: "stdout", line: row("Clientes atendidos", String(totClientes)) });
    emit({ type: "stdout", line: row("Artículos vendidos", String(totArt)) });
    emit({ type: "stdout", line: row("Ingreso total (Bs)", money(ingreso)) });
    emit({ type: "stdout", line: row("Costo variable total (Bs)", money(costoVar)) });
    emit({ type: "stdout", line: row("Costo fijo (Bs)", money(costo_fijo)) });
    emit({ type: "stdout", line: row("Ganancia neta (Bs)", money(ganancia)) });

    emit({
      type: "done",
      summary: {
        horas: H,
        clientesAtendidos: totClientes,
        articulosVendidos: totArt,
        ingresoTotalBs: Number(ingreso.toFixed(2)),
        costoVariableBs: Number(costoVar.toFixed(2)),
        costoFijoBs: Number(costo_fijo.toFixed(2)),
        gananciaNetaBs: Number(ganancia.toFixed(2)),
      },
    });
  },
};
