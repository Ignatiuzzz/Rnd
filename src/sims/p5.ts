import type { RunnerSpec } from "../events";

/**
 * Simulación granjero (Poisson):
 *  - Producción diaria ~ Poisson(λ)
 *  - 20% huevos rotos
 *  - 30% nacen pollos (80% vivos, 20% mueren)
 *  - 50% permanecen huevos
 *  - Tabla por día + resumen legible
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
    return { next() { x = (Math.imul(a, x) + c) >>> 0; return x / m; } };
}

/* Poisson(λ) de Knuth */
function poissonKnuth(lambda: number, rnd: () => number): number {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rnd(); } while (p > L);
    return k - 1;
}

export const simP5: RunnerSpec = {
    id: "p5",
    title: "P5 - Granjero Poisson (λ huevos/día)",
    description:
        "Por día: Poisson(λ). 20% rotos, 30% pollos (80% vivos/20% mueren), 50% quedan huevos.",
    inputs: [
        { key: "dias", label: "Días a simular", type: "int", defaultValue: 30 },
        { key: "lambda", label: "λ (huevos/día)", type: "float", defaultValue: 1.0 },
        { key: "precio_huevo", label: "Precio huevo (Bs/u.)", type: "float", defaultValue: 1.5 },
        { key: "precio_pollo", label: "Precio pollo (Bs/u.)", type: "float", defaultValue: 5.0 },
        { key: "seed", label: "Semilla RNG (opcional)", type: "string", defaultValue: "" },
    ],
    async run(params, emit) {
        const dias = Number.isFinite(+params.dias) && +params.dias > 0 ? Math.floor(+params.dias) : 30;
        const lambda = Number.isFinite(+params.lambda) && +params.lambda >= 0 ? +params.lambda : 1.0;
        const precioHuevo = Number.isFinite(+params.precio_huevo) ? +params.precio_huevo : 1.5;
        const precioPollo = Number.isFinite(+params.precio_pollo) ? +params.precio_pollo : 5.0;
        const seedStr = String(params.seed ?? "").trim();
        const rng = seedStr ? makeLCG(strToSeed(seedStr)) : makeLCG((Math.random() * 1e9) >>> 0);

        // 1) Parámetros legibles
        emit({
            type: "info",
            panel: "params",
            data: [
                { label: "Días a simular", value: dias },
                { label: "λ (huevos por día)", value: lambda },
                { label: "Precio del huevo", value: `${precioHuevo.toFixed(2)} Bs/u.` },
                { label: "Precio del pollo", value: `${precioPollo.toFixed(2)} Bs/u.` },
                { label: "Semilla RNG", value: seedStr === "" ? "Aleatoria" : `"${seedStr}" (determinista)` },
                { label: "Reglas", value: "20% rotos, 30% pollos (80% vivos/20% mueren), 50% quedan huevos" },
            ],
        } as any);

        // 2) Tabla por día
        emit({
            type: "step",
            name: "table:init",
            data: {
                title: "Producción y resultados por día",
                columns: [
                    { key: "dia", label: "Día", align: "right" },
                    { key: "hoy", label: "Huevos producidos", align: "right" },
                    { key: "perm", label: "Quedan huevos", align: "right" },
                    { key: "rotos", label: "Huevos rotos", align: "right" },
                    { key: "vivos", label: "Pollos vivos", align: "right" },
                    { key: "mueren", label: "Pollos muertos", align: "right" },
                    { key: "ingreso", label: "Ingreso del día (Bs)", align: "right" },
                    { key: "neto", label: "Neto del día (Bs)", align: "right" },
                ],
            },
        });

        // Totales
        let huevos_perm = 0, huevos_rotos = 0, pollos_vivos = 0, pollos_muertos = 0, total_huevos = 0;

        for (let d = 1; d <= dias; d++) {
            const huevosHoy = poissonKnuth(lambda, () => rng.next());
            let hp = 0, hr = 0, pv = 0, pm = 0;

            for (let i = 0; i < huevosHoy; i++) {
                const r = rng.next();
                if (r < 0.20) hr++;
                else if (r < 0.50) {
                    const r2 = rng.next();
                    if (r2 < 0.80) pv++; else pm++;
                } else hp++;
            }

            // Actualizar totales
            total_huevos += huevosHoy;
            huevos_perm += hp;
            huevos_rotos += hr;
            pollos_vivos += pv;
            pollos_muertos += pm;

            // Contabilidad del día
            const ingresoDia = hp * precioHuevo + pv * precioPollo;
            const netoDia = ingresoDia - (hr * precioHuevo + pm * precioPollo);

            emit({
                type: "step",
                name: "table:row",
                data: {
                    dia: d,
                    hoy: huevosHoy,
                    perm: hp,
                    rotos: hr,
                    vivos: pv,
                    mueren: pm,
                    ingreso: Number(ingresoDia.toFixed(2)),
                    neto: Number(netoDia.toFixed(2)),
                },
            });
        }

        const ingreso_total = huevos_perm * precioHuevo + pollos_vivos * precioPollo;
        const ingreso_promedio = dias > 0 ? ingreso_total / dias : 0;
        const ingreso_neto = ingreso_total - (huevos_rotos * precioHuevo + pollos_muertos * precioPollo);

        // 3) Resumen amigable
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
            summaryFriendly: {
                title: "Resumen",
                rows: [
                    { label: "Días simulados", value: dias },
                    { label: "Huevos producidos (total)", value: total_huevos },
                    { label: "Huevos que permanecen", value: huevos_perm },
                    { label: "Huevos rotos", value: huevos_rotos },
                    { label: "Pollos vivos", value: pollos_vivos },
                    { label: "Pollos muertos", value: pollos_muertos },
                    { label: "Ingreso TOTAL", value: `${ingreso_total.toFixed(2)} Bs` },
                    { label: "Ingreso PROMEDIO por día", value: `${ingreso_promedio.toFixed(2)} Bs` },
                    { label: "Ingreso NETO", value: `${ingreso_neto.toFixed(2)} Bs` },
                ],
            },
        } as any);
    },
};
