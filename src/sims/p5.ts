// client/src/sims/p5.ts
import type { RunnerSpec } from "../events";

/**
 * Simulación granjero (Poisson) — reglas:
 *  - Producción diaria ~ Poisson(λ)
 *  - 20% huevos rotos
 *  - 30% nacen pollos; de esos, 80% vivos y 20% mueren
 *  - 50% permanecen huevos
 *  - Precio huevo (Bs) y precio pollo (Bs)
 *  - Semilla RNG opcional
 *
 * Imprime:
 *  - Tabla por día (producción y desglose)
 *  - Resumen final con totales y métricas clave
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
    };
}

/* ---------- Poisson(λ) de Knuth usando RNG anterior ---------- */
function poissonKnuth(lambda: number, rnd: () => number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
        k++;
        p *= rnd();
    } while (p > L);
    return k - 1;
}

/* ---------- helpers de formato ---------- */
const money = (v: number) => v.toFixed(2).padStart(10);
const intw = (v: number, w = 4) => String(v).padStart(w);
const sep = (len = 96) => "─".repeat(len);
const padR = (s: string, w: number) => (s + " ".repeat(w)).slice(0, w);

export const simP5: RunnerSpec = {
    id: "p5",
    title: "P5 - Granjero Poisson (λ huevos/día)",
    description:
        "Por día: Poisson(λ). 20% rotos, 30% pollos (80% vivos/20% mueren), 50% se quedan huevos.",
    inputs: [
        { key: "dias", label: "Días a simular", type: "int", defaultValue: 30 },
        { key: "lambda", label: "λ (huevos/día)", type: "float", defaultValue: 1.0 },
        { key: "precio_huevo", label: "Precio huevo (Bs/u.)", type: "float", defaultValue: 1.5 },
        { key: "precio_pollo", label: "Precio pollo (Bs/u.)", type: "float", defaultValue: 5.0 },
        { key: "seed", label: "Semilla RNG (opcional)", type: "string", defaultValue: "" },
    ],
    async run(params, emit) {
        // Leer/validar
        const dias = Number.isFinite(+params.dias) && +params.dias > 0 ? Math.floor(+params.dias) : 30;
        const lambda = Number.isFinite(+params.lambda) && +params.lambda >= 0 ? +params.lambda : 1.0;
        const precioHuevo = Number.isFinite(+params.precio_huevo) ? +params.precio_huevo : 1.5;
        const precioPollo = Number.isFinite(+params.precio_pollo) ? +params.precio_pollo : 5.0;
        const seedStr = String(params.seed ?? "").trim();

        const rng = seedStr ? makeLCG(strToSeed(seedStr)) : makeLCG((Math.random() * 1e9) >>> 0);

        // Totales
        let huevos_perm = 0;
        let huevos_rotos = 0;
        let pollos_vivos = 0;
        let pollos_muertos = 0;
        let total_huevos = 0;

        // Parámetros
        emit({ type: "stdout", line: "╔══════════════════════════════════════════════════════════════════╗" });
        emit({ type: "stdout", line: "║                 PARÁMETROS DE LA SIMULACIÓN (P5)                 ║" });
        emit({ type: "stdout", line: "╚══════════════════════════════════════════════════════════════════╝" });
        emit({ type: "stdout", line: `• Días a simular           : ${dias}` });
        emit({ type: "stdout", line: `• λ (huevos por día)       : ${lambda}` });
        emit({ type: "stdout", line: `• Precio huevo (Bs/u.)     : ${precioHuevo}` });
        emit({ type: "stdout", line: `• Precio pollo (Bs/u.)     : ${precioPollo}` });
        emit({ type: "stdout", line: `• Semilla RNG              : ${seedStr === "" ? "aleatoria" : `"${seedStr}" (determinista)"`}` });
        emit({ type: "stdout", line: "" });

        // Cabecera de tabla por día
        const header =
            padR("DÍA", 5) + " | " +
            padR("HUEVOS HOY", 12) + " | " +
            padR("PERMANECEN", 12) + " | " +
            padR("ROTOS", 7) + " | " +
            padR("POLLOS VIVOS", 13) + " | " +
            padR("POLLOS MUERTOS", 15) + " | " +
            padR("INGRESO DÍA (Bs)", 17) + " | " +
            padR("NETO DÍA (Bs)", 14);
        emit({ type: "stdout", line: header });
        emit({ type: "stdout", line: sep(header.length) });

        // Simulación diaria
        for (let d = 1; d <= dias; d++) {
            const huevosHoy = poissonKnuth(lambda, () => rng.next());
            let hp = 0, hr = 0, pv = 0, pm = 0;

            for (let i = 0; i < huevosHoy; i++) {
                const r = rng.next();
                if (r < 0.20) {
                    hr++;
                } else if (r < 0.50) {
                    // 30%: nacen pollos
                    const r2 = rng.next();
                    if (r2 < 0.80) pv++;
                    else pm++;
                } else {
                    hp++;
                }
            }

            // actualizar totales
            total_huevos += huevosHoy;
            huevos_perm += hp;
            huevos_rotos += hr;
            pollos_vivos += pv;
            pollos_muertos += pm;

            // contabilidad del día (como referencia; el Python solo resumía al final)
            const ingresoDia = hp * precioHuevo + pv * precioPollo;
            const netoDia = ingresoDia - (hr * precioHuevo + pm * precioPollo);

            const line =
                padR(intw(d), 5) + " | " +
                padR(intw(huevosHoy, 6), 12) + " | " +
                padR(intw(hp, 6), 12) + " | " +
                padR(intw(hr, 4), 7) + " | " +
                padR(intw(pv, 6), 13) + " | " +
                padR(intw(pm, 6), 15) + " | " +
                padR(money(ingresoDia), 17) + " | " +
                padR(money(netoDia), 14);

            emit({ type: "stdout", line });
        }

        emit({ type: "stdout", line: sep(header.length) });

        // Totales y métricas finales
        const ingreso_total = huevos_perm * precioHuevo + pollos_vivos * precioPollo;
        const ingreso_promedio = dias > 0 ? ingreso_total / dias : 0;
        const ingreso_neto = ingreso_total - (huevos_rotos * precioHuevo + pollos_muertos * precioPollo);

        emit({ type: "stdout", line: "" });
        emit({ type: "stdout", line: "╔══════════════════════════════════════════════╗" });
        emit({ type: "stdout", line: "║                 RESUMEN FINAL                ║" });
        emit({ type: "stdout", line: "╚══════════════════════════════════════════════╝" });

        const L = 30;
        const row = (k: string, v: string) => `• ${padR(k + ":", L)} ${v}`;

        emit({ type: "stdout", line: row("Días simulados", String(dias)) });
        emit({ type: "stdout", line: row("Huevos producidos (total)", String(total_huevos)) });
        emit({ type: "stdout", line: row("Huevos que permanecen", String(huevos_perm)) });
        emit({ type: "stdout", line: row("Huevos rotos", String(huevos_rotos)) });
        emit({ type: "stdout", line: row("Pollos que sobreviven", String(pollos_vivos)) });
        emit({ type: "stdout", line: row("Pollos que mueren", String(pollos_muertos)) });
        emit({ type: "stdout", line: row("Ingreso TOTAL (Bs)", money(ingreso_total)) });
        emit({ type: "stdout", line: row("Ingreso PROMEDIO por día (Bs)", money(ingreso_promedio)) });
        emit({ type: "stdout", line: row("Ingreso NETO (Bs)", money(ingreso_neto)) });

        emit({
            type: "done",
            summary: {
                dias,
                lambda,
                totalHuevos: total_huevos,
                huevosPermanecen: huevos_perm,
                huevosRotos: huevos_rotos,
                pollosVivos: pollos_vivos,
                pollosMuertos: pollos_muertos,
                ingresoTotalBs: Number(ingreso_total.toFixed(2)),
                ingresoPromedioDiaBs: Number(ingreso_promedio.toFixed(2)),
                ingresoNetoBs: Number(ingreso_neto.toFixed(2)),
            },
        });
    },
};
