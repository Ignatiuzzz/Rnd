// client/src/sims/p6.ts
import type { RunnerSpec } from "../events";

/**
 * Inventario de azúcar con demanda insatisfecha.
 * Variables (nombres claros):
 *  - NMD: días a simular
 *  - CBO: capacidad de bodega (kg)
 *  - PUV: precio de venta (Bs/kg)
 *  - CADQ: costo de adquisición (Bs/kg)
 *  - CINV: costo de inventario (Bs/kg·día)
 *  - CORDET_UNIT: costo por orden (Bs/orden)
 *  - media_demanda: media de la demanda diaria (kg/día), demanda ~ Exponencial(media)
 *  - seed: semilla opcional para reproducibilidad
 *
 * Estado y métricas:
 *  - IAZU: inventario actual (kg)
 *  - ENTREGAS: lista de [dia_entrega, cantidad]
 *  - IBRU: ingreso bruto acumulado
 *  - CTADQ: costo de adquisición acumulado
 *  - CTINV: costo de inventario acumulado
 *  - CORDET: costo de órdenes acumulado
 *  - DDEM: demanda total acumulada
 *  - DINS: demanda insatisfecha acumulada
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
        next() { x = (Math.imul(a, x) + c) >>> 0; return x / m; },       // [0,1)
        randint(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); },
    };
}

/* ---------- Demanda Exponencial(media) por inversa ---------- */
function demandaExp(media: number, rnd: () => number): number {
    // U ~ (0,1) ⇒ X = -media * ln(1-U)
    const u = Math.max(1e-12, 1 - rnd());
    return -media * Math.log(u);
}

/* ---------- helpers de formato ---------- */
const money = (v: number) => v.toFixed(2).padStart(10);
const qty = (v: number, w = 7) => Math.round(v).toString().padStart(w);
const padR = (s: string, w: number) => (s + " ".repeat(w)).slice(0, w);
const sep = (len = 90) => "─".repeat(len);

export const simP6: RunnerSpec = {
    id: "p6",
    title: "P6 - Inventario de azúcar + Demanda Insatisfecha",
    description:
        "Simula NMD días con demanda diaria ~ Exponencial(media). Revisión semanal, órdenes con lead time U{1,2,3}.",
    inputs: [
        { key: "NMD", label: "Días a simular (NMD)", type: "int", defaultValue: 27 },
        { key: "CBO", label: "Capacidad bodega (kg, CBO)", type: "float", defaultValue: 700 },
        { key: "PUV", label: "Precio venta (Bs/kg, PUV)", type: "float", defaultValue: 5.0 },
        { key: "CADQ", label: "Costo adquisición (Bs/kg, CADQ)", type: "float", defaultValue: 3.5 },
        { key: "CINV", label: "Costo inventario (Bs/kg·día, CINV)", type: "float", defaultValue: 0.1 },
        { key: "CORDET_UNIT", label: "Costo por orden (Bs, CORDET)", type: "float", defaultValue: 100 },
        { key: "media_demanda", label: "Demanda media (kg/día)", type: "float", defaultValue: 100 },
        { key: "seed", label: "Semilla RNG (opcional)", type: "string", defaultValue: "" },
    ],
    async run(params, emit) {
        // Lectura/validación
        const NMD = Number.isFinite(+params.NMD) && +params.NMD > 0 ? Math.floor(+params.NMD) : 27;
        const CBO = Number.isFinite(+params.CBO) && +params.CBO > 0 ? +params.CBO : 700;
        const PUV = Number.isFinite(+params.PUV) && +params.PUV >= 0 ? +params.PUV : 5.0;
        const CADQ = Number.isFinite(+params.CADQ) && +params.CADQ >= 0 ? +params.CADQ : 3.5;
        const CINV = Number.isFinite(+params.CINV) && +params.CINV >= 0 ? +params.CINV : 0.1;
        const CORDET_UNIT = Number.isFinite(+params.CORDET_UNIT) && +params.CORDET_UNIT >= 0 ? +params.CORDET_UNIT : 100;
        const media_demanda = Number.isFinite(+params.media_demanda) && +params.media_demanda > 0 ? +params.media_demanda : 100;
        const seedStr = String(params.seed ?? "").trim();

        const rng = seedStr ? makeLCG(strToSeed(seedStr)) : makeLCG((Math.random() * 1e9) >>> 0);

        // Estado inicial
        let CD = 1;                    // día corriente
        let IAZU = CBO;                // inventario inicial lleno
        let IBRU = 0;                  // ingreso bruto
        let CTINV = 0;                 // costo inventario
        let CTADQ = 0;                 // costo adquisición
        let CORDET = 0;                // costo órdenes
        let ENTREGAS: Array<[number, number]> = []; // [día_entrega, cantidad]

        // Métricas demanda
        let DDEM = 0;  // demanda total
        let DINS = 0;  // demanda insatisfecha

        // Encabezado: parámetros
        emit({ type: "stdout", line: "╔══════════════════════════════════════════════════════════════════════════╗" });
        emit({ type: "stdout", line: "║                  PARÁMETROS DE LA SIMULACIÓN (P6)                        ║" });
        emit({ type: "stdout", line: "╚══════════════════════════════════════════════════════════════════════════╝" });
        emit({ type: "stdout", line: `• Días a simular (NMD)                  : ${NMD}` });
        emit({ type: "stdout", line: `• Capacidad bodega (CBO, kg)            : ${CBO}` });
        emit({ type: "stdout", line: `• Precio de venta (PUV, Bs/kg)          : ${PUV}` });
        emit({ type: "stdout", line: `• Costo adquisición (CADQ, Bs/kg)       : ${CADQ}` });
        emit({ type: "stdout", line: `• Costo inventario (CINV, Bs/kg·día)    : ${CINV}` });
        emit({ type: "stdout", line: `• Costo por orden (CORDET, Bs)          : ${CORDET_UNIT}` });
        emit({ type: "stdout", line: `• Demanda media (kg/día)                : ${media_demanda}` });
        emit({ type: "stdout", line: `• Semilla RNG                           : ${seedStr === "" ? "aleatoria" : `"${seedStr}" (determinista)"`}` });
        emit({ type: "stdout", line: "" });

        // Cabecera de tabla diaria
        const header =
            padR("DÍA", 4) + " | " +
            padR("INV_INI(kg)", 11) + " | " +
            padR("DEMANDA(kg)", 11) + " | " +
            padR("VENDIDO(kg)", 11) + " | " +
            padR("PERDIDO(kg)", 11) + " | " +
            padR("RECIBIDO(kg)", 12) + " | " +
            padR("INV_FIN(kg)", 11) + " | " +
            padR("OBS", 20);
        emit({ type: "stdout", line: header });
        emit({ type: "stdout", line: sep(header.length) });

        // Simulación día a día
        while (CD <= NMD) {
            const inv_ini = IAZU;
            let recibido_hoy = 0;
            const obs: string[] = [];

            // 1) Llegadas programadas para hoy
            if (ENTREGAS.length) {
                const llegadas = ENTREGAS.filter(([dia]) => dia === CD);
                if (llegadas.length) {
                    let quedan: Array<[number, number]> = [];
                    for (const [_, cant] of llegadas) {
                        const espacio = CBO - IAZU;
                        const delta = Math.max(0, Math.min(espacio, cant));
                        if (delta > 0) {
                            IAZU += delta;
                            recibido_hoy += delta;
                            CTADQ += delta * CADQ;
                        }
                    }
                    // Mantener entregas futuras
                    quedan = ENTREGAS.filter(([dia]) => dia > CD);
                    ENTREGAS = quedan;
                    obs.push("entrega");
                }
            }

            // 2) Demanda del día (Exponencial(media))
            const DAZU = demandaExp(media_demanda, () => rng.next());
            DDEM += DAZU;

            let vendido: number, perdido: number;
            if (IAZU >= DAZU) {
                vendido = DAZU;
                perdido = 0;
                IAZU -= DAZU;
            } else {
                vendido = IAZU;
                perdido = DAZU - IAZU;
                IAZU = 0;
            }
            DINS += perdido;

            // 3) Ingresos del día
            IBRU += vendido * PUV;

            // 4) Costo de inventario (holding)
            CTINV += IAZU * CINV;

            // 5) Revisión semanal: ordenar hasta capacidad, lead time U{1,2,3}
            if (CD % 7 === 0) {
                const PAZU = CBO - IAZU; // cantidad a pedir para llenar bodega
                if (PAZU > 0) {
                    const TENT = rng.randint(1, 3);
                    const DIT = CD + TENT;
                    ENTREGAS.push([DIT, Math.round(PAZU)]);
                    CORDET += CORDET_UNIT;
                    obs.push(`orden ${Math.round(PAZU)}kg→día ${DIT}`);
                }
            }

            // 6) Línea del día
            const line =
                padR(String(CD), 4) + " | " +
                padR(qty(inv_ini), 11) + " | " +
                padR(qty(DAZU), 11) + " | " +
                padR(qty(vendido), 11) + " | " +
                padR(qty(perdido), 11) + " | " +
                padR(qty(recibido_hoy, 5), 12) + " | " +
                padR(qty(IAZU), 11) + " | " +
                padR(obs.join(", "), 20);

            emit({ type: "stdout", line });

            CD += 1;
        }

        emit({ type: "stdout", line: sep(header.length) });

        // 7) Totales finales
        const CTOT = CTADQ + CTINV + CORDET;
        const GNETA = IBRU - CTOT;
        const perdida_pct = DDEM > 0 ? (100 * DINS) / DDEM : 0;

        // Resumen final
        emit({ type: "stdout", line: "" });
        emit({ type: "stdout", line: "╔══════════════════════════════════════════════╗" });
        emit({ type: "stdout", line: "║                 RESUMEN FINAL                ║" });
        emit({ type: "stdout", line: "╚══════════════════════════════════════════════╝" });
        const L = 34;
        const row = (k: string, v: string) => `• ${padR(k + ":", L)} ${v}`;

        emit({ type: "stdout", line: row("Demanda total (kg)", String(Math.round(DDEM))) });
        emit({ type: "stdout", line: row("Demanda insatisfecha (kg)", `${Math.round(DINS)} (${perdida_pct.toFixed(2)}%)`) });
        emit({ type: "stdout", line: row("IBRU (ingreso bruto, Bs)", money(IBRU)) });
        emit({ type: "stdout", line: row("CTADQ (adquisición, Bs)", money(CTADQ)) });
        emit({ type: "stdout", line: row("CTINV (inventario, Bs)", money(CTINV)) });
        emit({ type: "stdout", line: row("CORDET (órdenes, Bs)", money(CORDET)) });
        emit({ type: "stdout", line: row("CTOT (costo total, Bs)", money(CTOT)) });
        emit({ type: "stdout", line: row("GNETA (ganancia neta, Bs)", money(GNETA)) });

        emit({
            type: "done",
            summary: {
                NMD, CBO, PUV, CADQ, CINV, CORDET_UNIT, media_demanda,
                demandaTotalKg: Math.round(DDEM),
                demandaInsatisfechaKg: Math.round(DINS),
                porcentajePerdida: Number(perdida_pct.toFixed(2)),
                ingresoBrutoBs: Number(IBRU.toFixed(2)),
                costoAdquisicionBs: Number(CTADQ.toFixed(2)),
                costoInventarioBs: Number(CTINV.toFixed(2)),
                costoOrdenesBs: Number(CORDET.toFixed(2)),
                costoTotalBs: Number(CTOT.toFixed(2)),
                gananciaNetaBs: Number(GNETA.toFixed(2)),
                inventarioFinalKg: Math.round(IAZU),
            },
        });
    },
};
