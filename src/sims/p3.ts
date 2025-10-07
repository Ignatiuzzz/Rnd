// client/src/sims/p3.ts
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
    next() {
      x = (Math.imul(a, x) + c) >>> 0;
      return x / m;
    },
    randint1to6() {
      return 1 + Math.floor(this.next() * 6);
    },
  };
}

export const simP3: RunnerSpec = {
  id: "p3",
  title: "P3 - Juego de dados (la casa pierde si sale 7)",
  description:
    "Simula N juegos: suma 7 → casa −3 Bs; suma ≠ 7 → casa +2 Bs.",
  inputs: [
    { key: "N", label: "N (número de juegos)", type: "int", defaultValue: 10 },
    { key: "seed", label: "Semilla RNG (opcional)", type: "string", defaultValue: "" },
  ],
  async run(params, emit) {
    const Nraw = Number(params.N);
    const N = Number.isFinite(Nraw) && Nraw > 0 ? Math.floor(Nraw) : 10;
    const seedStr = String(params.seed ?? "").trim();

    const rng = seedStr ? makeLCG(strToSeed(seedStr)) : makeLCG((Math.random() * 1e9) >>> 0);

    let juegos = 0;
    let ganaCasa = 0;
    let pierdeCasa = 0;
    let gananciaAcum = 0;

    // Parámetros
    emit({ type: "stdout", line: `Parámetros:` });
    emit({ type: "stdout", line: `  • N (número de juegos): ${N}` });
    emit({ type: "stdout", line: `  • Semilla RNG: ${seedStr === "" ? "aleatoria" : `"${seedStr}" (determinista)"`}` });
    emit({ type: "stdout", line: "" });

    // Encabezado claro
    emit({ type: "stdout", line: "N° Juego | Dado 1  Dado 2 | Suma | Resultado     | Ganancia Acumulada (Bs)" });
    emit({ type: "stdout", line: "--------------------------------------------------------------------------" });

    while (juegos < N) {
      const d1 = rng.randint1to6();
      const d2 = rng.randint1to6();
      const suma = d1 + d2;

      let resultado: "Casa gana" | "Casa pierde";
      if (suma === 7) {
        gananciaAcum += -3;
        pierdeCasa++;
        resultado = "Casa pierde";
      } else {
        gananciaAcum += 2;
        ganaCasa++;
        resultado = "Casa gana";
      }

      juegos++;

      const linea =
        `${String(juegos).padStart(8)} |` +
        `   ${String(d1).padStart(2)}      ${String(d2).padStart(2)} |` +
        `  ${String(suma).padStart(3)} | ` +
        `${resultado.padEnd(13)} | ` +
        `${gananciaAcum.toFixed(2).padStart(23)}`;
      emit({ type: "stdout", line: linea });
    }

    emit({ type: "stdout", line: "--------------------------------------------------------------------------" });

    const porcentajeGana = N > 0 ? (100 * ganaCasa) / N : 0;

    // Resumen con nombres entendibles
    emit({ type: "stdout", line: "Resumen:" });
    emit({ type: "stdout", line: `  • Total de juegos: ${N}` });
    emit({ type: "stdout", line: `  • Juegos ganados por la casa (suma ≠ 7): ${ganaCasa}` });
    emit({ type: "stdout", line: `  • Juegos perdidos por la casa (suma = 7): ${pierdeCasa}` });
    emit({ type: "stdout", line: `  • Porcentaje de juegos ganados por la casa: ${porcentajeGana.toFixed(2)}%` });
    emit({ type: "stdout", line: `  • Ganancia neta total de la casa: ${gananciaAcum.toFixed(2)} Bs` });

    emit({
      type: "done",
      summary: {
        totalJuegos: N,
        ganadosCasa: ganaCasa,
        perdidosCasa: pierdeCasa,
        porcentajeGanadosCasa: Number(porcentajeGana.toFixed(2)),
        gananciaNetaTotalBs: Number(gananciaAcum.toFixed(2)),
      },
    });
  },
};
