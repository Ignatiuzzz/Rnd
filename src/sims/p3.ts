import type { RunnerSpec } from "../events";

/**
 * Juego de dados: la casa gana si la suma != 7; si sale 7 la casa pierde.
 * Reglas:
 *  - Cada juego cuesta 2 Bs (la casa los recibe).
 *  - Si sale 7, la casa paga 5 Bs -> neto = -3 Bs.
 *  - Si NO sale 7 -> neto = +2 Bs.
 */

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
    randint1to6() { return 1 + Math.floor(this.next() * 6); },
  };
}

export const simP3: RunnerSpec = {
  id: "p3",
  title: "P3 - Juego de dados (la casa pierde si sale 7)",
  description: "Simula N juegos: suma 7 → casa −3 Bs; suma ≠ 7 → casa +2 Bs.",
  inputs: [
    { key: "N", label: "Número de juegos", type: "int", defaultValue: 10 },
    { key: "seed", label: "Semilla RNG (opcional)", type: "string", defaultValue: "" },
  ],
  async run(params, emit) {
    // ===== VALIDACIÓN =====
    const ERR: string[] = [];
    const NMax = 100000; // Evita bloqueos por tamaños gigantes

    // N: entero, >0, finito y razonable
    const Nraw = Number(params.N);
    if (!Number.isFinite(Nraw)) {
      ERR.push("«Número de juegos» debe ser un número válido (sin letras).");
    } else if (!Number.isInteger(Nraw)) {
      ERR.push("«Número de juegos» debe ser un entero (sin decimales).");
    } else if (Nraw <= 0) {
      ERR.push("«Número de juegos» debe ser mayor que 0.");
    } else if (Nraw > NMax) {
      ERR.push(`«Número de juegos» no puede ser mayor que ${NMax}.`);
    }

    // Semilla: opcional, pero si viene pedimos un tamaño razonable
    const seedStr = String(params.seed ?? "").trim();
    if (seedStr.length > 120) {
      ERR.push("La semilla es demasiado larga (máximo 120 caracteres).");
    }

    // Si hay errores, los mostramos y cancelamos
    if (ERR.length) {
      ERR.forEach((msg) => emit({ type: "stderr", line: msg }));
      emit({ type: "stderr", line: "Corrige los campos y vuelve a intentar." });
      return;
    }

    const N = Math.floor(Nraw);
    const rng = seedStr
      ? makeLCG(strToSeed(seedStr))
      : makeLCG((Math.random() * 1e9) >>> 0);

    // 1) Parámetros legibles
    emit({
      type: "info",
      panel: "params",
      data: [
        { label: "Número de juegos", value: N },
        { label: "Semilla RNG", value: seedStr === "" ? "Aleatoria" : `"${seedStr}" (determinista)` },
        { label: "Regla de pago", value: "Suma = 7 → −3 Bs; Suma ≠ 7 → +2 Bs" },
      ],
    } as any);

    // 2) Tabla: especificación
    emit({
      type: "step",
      name: "table:init",
      data: {
        title: "Resultados por juego",
        columns: [
          { key: "juego", label: "Juego", align: "right" },
          { key: "d1", label: "Dado 1", align: "right" },
          { key: "d2", label: "Dado 2", align: "right" },
          { key: "suma", label: "Suma", align: "right" },
          { key: "resultado", label: "Resultado" },
          { key: "gananciaAcum", label: "Ganancia acumulada (Bs)", align: "right" },
        ],
      },
    });

    // 3) Simulación
    let juegos = 0;
    let ganaCasa = 0;
    let pierdeCasa = 0;
    let gananciaAcum = 0;

    while (juegos < N) {
      const d1 = rng.randint1to6();
      const d2 = rng.randint1to6();
      const suma = d1 + d2;

      const casaPierde = suma === 7;
      if (casaPierde) {
        gananciaAcum += -3;
        pierdeCasa++;
      } else {
        gananciaAcum += 2;
        ganaCasa++;
      }

      juegos++;

      emit({
        type: "step",
        name: "table:row",
        data: {
          juego: juegos,
          d1,
          d2,
          suma,
          resultado: casaPierde ? "Casa pierde" : "Casa gana",
          gananciaAcum: Number(gananciaAcum.toFixed(2)),
        },
      });
    }

    const porcentajeGana = N > 0 ? (100 * ganaCasa) / N : 0;

    // 4) Resumen amigable
    emit({
      type: "done",
      summary: {
        totalJuegos: N,
        ganadosCasa: ganaCasa,
        perdidosCasa: pierdeCasa,
        porcentajeGanadosCasa: Number(porcentajeGana.toFixed(2)),
        gananciaNetaTotalBs: Number(gananciaAcum.toFixed(2)),
      },
      summaryFriendly: {
        title: "Resumen",
        rows: [
          { label: "Total de juegos", value: N },
          { label: "Juegos ganados por la casa (suma ≠ 7)", value: ganaCasa },
          { label: "Juegos perdidos por la casa (suma = 7)", value: pierdeCasa },
          { label: "Porcentaje de juegos ganados", value: `${porcentajeGana.toFixed(2)} %` },
          { label: "Ganancia neta total", value: `${gananciaAcum.toFixed(2)} Bs` },
        ],
      },
    } as any);
  },
};
