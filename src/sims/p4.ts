import type { RunnerSpec } from "../events";

/**
 * Simulación de tienda:
 * - Horas del día H.
 * - Llegadas por hora: entero uniforme en [0,4].
 * - Artículos por cliente (pmf): 0:0.2, 1:0.3, 2:0.4, 3:0.1.
 * - Precio de venta, costo unitario y costo fijo.
 * Emite tabla por hora y resumen final con nombres legibles.
 */

/* RNG con semilla */
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
    next() { x = (Math.imul(a, x) + c) >>> 0; return x / m; },
    randint(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
  };
}

/* PMF artículos por cliente */
function sampleArticulos(u: number): number {
  if (u < 0.2) return 0;
  if (u < 0.5) return 1;
  if (u < 0.9) return 2;
  return 3;
}

export const simP4: RunnerSpec = {
  id: "p4",
  title: "P4 - Tienda (llegadas uniformes 0..4 por hora)",
  description: "Simula H horas. Tabla por hora y resumen final.",
  inputs: [
    { key: "H",           label: "Horas del día",             type: "int",   defaultValue: 8   },
    { key: "costo_fijo",  label: "Costo fijo diario (Bs)",    type: "float", defaultValue: 300 },
    { key: "costo",       label: "Costo por artículo (Bs)",   type: "float", defaultValue: 50  },
    { key: "precio",      label: "Precio de venta (Bs)",      type: "float", defaultValue: 75  },
    { key: "seed",        label: "Semilla RNG (opcional)",    type: "string", defaultValue: "" },
  ],
  async run(params, emit) {
    const H           = Number.isFinite(+params.H)          && +params.H > 0 ? Math.floor(+params.H) : 8;
    const costo_fijo  = Number.isFinite(+params.costo_fijo) ? +params.costo_fijo : 300;
    const costo       = Number.isFinite(+params.costo)      ? +params.costo : 50;
    const precio      = Number.isFinite(+params.precio)     ? +params.precio : 75;
    const seedStr     = String(params.seed ?? "").trim();
    const rng = seedStr ? makeLCG(strToSeed(seedStr)) : makeLCG((Math.random() * 1e9) >>> 0);

    // 1) Parámetros
    emit({
      type: "info",
      panel: "params",
      data: [
        { label: "Horas del día", value: H },
        { label: "Costo fijo diario", value: `${costo_fijo.toFixed(2)} Bs` },
        { label: "Costo por artículo", value: `${costo.toFixed(2)} Bs` },
        { label: "Precio de venta", value: `${precio.toFixed(2)} Bs` },
        { label: "Semilla RNG", value: seedStr === "" ? "Aleatoria" : `"${seedStr}" (determinista)` },
      ],
    } as any);

    // 2) Tabla por hora
    emit({
      type: "step",
      name: "table:init",
      data: {
        title: "Resultados por hora",
        columns: [
          { key: "hora", label: "Hora", align: "right" },
          { key: "clientes", label: "Clientes", align: "right" },
          { key: "articulos", label: "Artículos vendidos", align: "right" },
          { key: "ingreso", label: "Ingreso (Bs)", align: "right" },
          { key: "costoVar", label: "Costo variable (Bs)", align: "right" },
          { key: "ganancia", label: "Ganancia (Bs)", align: "right" },
        ],
      },
    });

    let totClientes = 0;
    let totArt = 0;
    let ingreso = 0;
    let costoVar = 0;

    for (let h = 1; h <= H; h++) {
      const clientes = rng.randint(0, 4);
      let artHora = 0;

      for (let c = 1; c <= clientes; c++) {
        const x = sampleArticulos(rng.next());
        artHora += x;
      }

      const ingresoHora = artHora * precio;
      const costoVarHora = artHora * costo;
      const ganHora = ingresoHora - costoVarHora;

      totClientes += clientes;
      totArt += artHora;
      ingreso += ingresoHora;
      costoVar += costoVarHora;

      emit({
        type: "step",
        name: "table:row",
        data: {
          hora: h,
          clientes,
          articulos: artHora,
          ingreso: Number(ingresoHora.toFixed(2)),
          costoVar: Number(costoVarHora.toFixed(2)),
          ganancia: Number(ganHora.toFixed(2)),
        },
      });
    }

    const gananciaNeta = ingreso - costoVar - costo_fijo;

    // 3) Resumen amigable
    emit({
      type: "done",
      summary: {
        horas: H,
        clientesAtendidos: totClientes,
        articulosVendidos: totArt,
        ingresoTotalBs: Number(ingreso.toFixed(2)),
        costoVariableBs: Number(costoVar.toFixed(2)),
        costoFijoBs: Number(costo_fijo.toFixed(2)),
        gananciaNetaBs: Number(gananciaNeta.toFixed(2)),
      },
      summaryFriendly: {
        title: "Resumen del día",
        rows: [
          { label: "Horas simuladas", value: H },
          { label: "Clientes atendidos", value: totClientes },
          { label: "Artículos vendidos", value: totArt },
          { label: "Ingreso total", value: `${ingreso.toFixed(2)} Bs` },
          { label: "Costo variable total", value: `${costoVar.toFixed(2)} Bs` },
          { label: "Costo fijo", value: `${costo_fijo.toFixed(2)} Bs` },
          { label: "Ganancia neta", value: `${gananciaNeta.toFixed(2)} Bs` },
        ],
      },
    } as any);
  },
};
