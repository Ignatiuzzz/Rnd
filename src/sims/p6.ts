import type { RunnerSpec } from "../events";

/**
 * Inventario de azúcar + demanda insatisfecha:
 *  - Demanda diaria ~ Exponencial(media)
 *  - Revisión semanal; se ordena para llenar bodega; lead time ~ U{1,2,3} días
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
    return {
        next() { x = (Math.imul(a, x) + c) >>> 0; return x / m; },
        randint(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); },
    };
}

/* Demanda Exponencial(media) por inversa */
function demandaExp(media: number, rnd: () => number): number {
    const u = Math.max(1e-12, 1 - rnd());
    return -media * Math.log(u);
}

export const simP6: RunnerSpec = {
    id: "p6",
    title: "P6 - Inventario de azúcar + Demanda Insatisfecha",
    description:
        "Demanda ~ Exponencial(media). Revisión semanal, lead time 1–3 días. Tabla diaria + resumen.",
    inputs: [
        { key: "NMD", label: "Días a simular", type: "int", defaultValue: 27 },
        { key: "CBO", label: "Capacidad de bodega (kg)", type: "float", defaultValue: 700 },
        { key: "PUV", label: "Precio de venta (Bs/kg)", type: "float", defaultValue: 5.0 },
        { key: "CADQ", label: "Costo de adquisición (Bs/kg)", type: "float", defaultValue: 3.5 },
        { key: "CINV", label: "Costo de inventario (Bs/kg·día)", type: "float", defaultValue: 0.1 },
        { key: "CORDET_UNIT", label: "Costo por orden (Bs)", type: "float", defaultValue: 100 },
        { key: "media_demanda", label: "Demanda media (kg/día)", type: "float", defaultValue: 100 },
        { key: "seed", label: "Semilla RNG (opcional)", type: "string", defaultValue: "" },
    ],
    async run(params, emit) {
        // ===== VALIDACIÓN =====
        const ERR: string[] = [];
        const WARN: string[] = [];

        // Límites razonables para evitar bloqueos
        const NMD_MAX = 5000;         // máx. de días
        const CBO_MAX = 10_000_000;   // máx. capacidad (kg)
        const PRICE_MAX = 1_000_000;  // máx. precios/costos
        const DEM_MAX = 1_000_000;    // máx. media de demanda (kg/día)
        const EXPECTED_TOTAL_MAX = 50_000_000; // tope de demanda esperada NMD * media_demanda

        // Parseos
        const nmdRaw = Number(params.NMD);
        const cboRaw = Number(params.CBO);
        const puvRaw = Number(params.PUV);
        const cadqRaw = Number(params.CADQ);
        const cinvRaw = Number(params.CINV);
        const cordRaw = Number(params.CORDET_UNIT);
        const mediaRaw = Number(params.media_demanda);
        const seedStr = String(params.seed ?? "").trim();

        // NMD: entero > 0 y <= NMD_MAX
        if (!Number.isFinite(nmdRaw)) ERR.push("«Días a simular» debe ser un número válido (sin letras).");
        else if (!Number.isInteger(nmdRaw)) ERR.push("«Días a simular» debe ser un entero (sin decimales).");
        else if (nmdRaw <= 0) ERR.push("«Días a simular» debe ser mayor que 0.");
        else if (nmdRaw > NMD_MAX) ERR.push(`«Días a simular» no puede ser mayor que ${NMD_MAX}.`);

        // CBO: > 0 y razonable
        if (!Number.isFinite(cboRaw)) ERR.push("«Capacidad de bodega (kg)» debe ser un número válido.");
        else if (cboRaw <= 0) ERR.push("«Capacidad de bodega (kg)» debe ser mayor que 0.");
        else if (cboRaw > CBO_MAX) ERR.push(`«Capacidad de bodega (kg)» no puede ser mayor que ${CBO_MAX.toLocaleString()} kg.`);

        // PUV, CADQ, CINV, CORDET_UNIT: >= 0 y razonables
        if (!Number.isFinite(puvRaw)) ERR.push("«Precio de venta (Bs/kg)» debe ser un número válido.");
        else if (puvRaw < 0) ERR.push("«Precio de venta (Bs/kg)» no puede ser negativo.");
        else if (puvRaw > PRICE_MAX) ERR.push(`«Precio de venta (Bs/kg)» es demasiado alto (>${PRICE_MAX}).`);

        if (!Number.isFinite(cadqRaw)) ERR.push("«Costo de adquisición (Bs/kg)» debe ser un número válido.");
        else if (cadqRaw < 0) ERR.push("«Costo de adquisición (Bs/kg)» no puede ser negativo.");
        else if (cadqRaw > PRICE_MAX) ERR.push(`«Costo de adquisición (Bs/kg)» es demasiado alto (>${PRICE_MAX}).`);

        if (!Number.isFinite(cinvRaw)) ERR.push("«Costo de inventario (Bs/kg·día)» debe ser un número válido.");
        else if (cinvRaw < 0) ERR.push("«Costo de inventario (Bs/kg·día)» no puede ser negativo.");
        else if (cinvRaw > PRICE_MAX) ERR.push(`«Costo de inventario (Bs/kg·día)» es demasiado alto (>${PRICE_MAX}).`);

        if (!Number.isFinite(cordRaw)) ERR.push("«Costo por orden (Bs)» debe ser un número válido.");
        else if (cordRaw < 0) ERR.push("«Costo por orden (Bs)» no puede ser negativo.");
        else if (cordRaw > PRICE_MAX) ERR.push(`«Costo por orden (Bs)» es demasiado alto (>${PRICE_MAX}).`);

        // media_demanda: > 0 y razonable
        if (!Number.isFinite(mediaRaw)) ERR.push("«Demanda media (kg/día)» debe ser un número válido.");
        else if (mediaRaw <= 0) ERR.push("«Demanda media (kg/día)» debe ser mayor que 0.");
        else if (mediaRaw > DEM_MAX) ERR.push(`«Demanda media (kg/día)» no puede ser mayor que ${DEM_MAX.toLocaleString()} kg/día.`);

        // Semilla: longitud máxima
        if (seedStr.length > 120) ERR.push("La semilla es demasiado larga (máximo 120 caracteres).");

        // Guard de rendimiento: demanda esperada = NMD * media
        if (Number.isFinite(nmdRaw) && Number.isFinite(mediaRaw)) {
            const expected = nmdRaw * mediaRaw;
            if (expected > EXPECTED_TOTAL_MAX) {
                ERR.push(
                    `La demanda total esperada (NMD × media) es demasiado grande (${expected.toLocaleString()} kg). ` +
                    `Reduce «Días a simular» o «Demanda media» (límite sugerido: ${EXPECTED_TOTAL_MAX.toLocaleString()} kg).`
                );
            } else if (expected > EXPECTED_TOTAL_MAX / 5) {
                WARN.push(
                    `Aviso: demanda esperada alta (${expected.toLocaleString()} kg); la simulación puede tardar más.`
                );
            }
        }

        // Advertencias de negocio (no bloquean)
        if (Number.isFinite(puvRaw) && Number.isFinite(cadqRaw) && puvRaw < cadqRaw) {
            WARN.push("Advertencia: el precio de venta (PUV) es menor que el costo de adquisición (CADQ).");
        }
        if (Number.isFinite(cinvRaw) && Number.isFinite(puvRaw) && cinvRaw > puvRaw) {
            WARN.push("Advertencia: el costo de inventario por kg·día supera el precio de venta por kg.");
        }

        // Si hay errores, detener
        if (ERR.length) {
            ERR.forEach((msg) => emit({ type: "stderr", line: msg }));
            emit({ type: "stderr", line: "Corrige los campos y vuelve a intentar." });
            return;
        }
        // Mostrar advertencias (si las hay)
        WARN.forEach((w) => emit({ type: "stderr", line: w }));

        // ===== Normalización =====
        const NMD = Math.floor(nmdRaw);
        const CBO = +cboRaw;
        const PUV = +puvRaw;
        const CADQ = +cadqRaw;
        const CINV = +cinvRaw;
        const CORDET_UNIT = +cordRaw;
        const media_demanda = +mediaRaw;

        const rng = seedStr ? makeLCG(strToSeed(seedStr)) : makeLCG((Math.random() * 1e9) >>> 0);

        // 1) Parámetros legibles
        emit({
            type: "info",
            panel: "params",
            data: [
                { label: "Días a simular", value: NMD },
                { label: "Capacidad de bodega", value: `${CBO} kg` },
                { label: "Precio de venta", value: `${PUV.toFixed(2)} Bs/kg` },
                { label: "Costo de adquisición", value: `${CADQ.toFixed(2)} Bs/kg` },
                { label: "Costo de inventario", value: `${CINV.toFixed(2)} Bs/kg·día` },
                { label: "Costo por orden", value: `${CORDET_UNIT.toFixed(2)} Bs` },
                { label: "Demanda media", value: `${media_demanda} kg/día` },
                { label: "Semilla RNG", value: seedStr === "" ? "Aleatoria" : `"${seedStr}" (determinista)` },
                { label: "Política de reabastecimiento", value: "Cada 7 días, llenar bodega; lead time 1–3 días" },
            ],
        } as any);

        // 2) Tabla diaria
        emit({
            type: "step",
            name: "table:init",
            data: {
                title: "Evolución diaria del inventario",
                columns: [
                    { key: "dia", label: "Día", align: "right" },
                    { key: "invIni", label: "Inventario inicial (kg)", align: "right" },
                    { key: "demanda", label: "Demanda (kg)", align: "right" },
                    { key: "vendido", label: "Vendido (kg)", align: "right" },
                    { key: "perdido", label: "No atendido (kg)", align: "right" },
                    { key: "recibido", label: "Recibido (kg)", align: "right" },
                    { key: "invFin", label: "Inventario final (kg)", align: "right" },
                    { key: "obs", label: "Observaciones" },
                ],
            },
        });

        // Estado
        let CD = 1;
        let IAZU = CBO;
        let IBRU = 0, CTINV = 0, CTADQ = 0, CORDET = 0;
        let ENTREGAS: Array<[number, number]> = []; // [día_entrega, cantidad]
        let DDEM = 0, DINS = 0;

        // Simulación
        while (CD <= NMD) {
            const inv_ini = IAZU;
            let recibido_hoy = 0;
            const obs: string[] = [];

            // Entregas que llegan hoy
            if (ENTREGAS.length) {
                const llegadas = ENTREGAS.filter(([dia]) => dia === CD);
                if (llegadas.length) {
                    const futuras: Array<[number, number]> = [];
                    for (const [dia, cant] of ENTREGAS) {
                        if (dia === CD) {
                            const espacio = CBO - IAZU;
                            const delta = Math.max(0, Math.min(espacio, cant));
                            if (delta > 0) {
                                IAZU += delta;
                                recibido_hoy += delta;
                                CTADQ += delta * CADQ;
                            }
                        } else futuras.push([dia, cant]);
                    }
                    ENTREGAS = futuras;
                    obs.push("entrega");
                }
            }

            // Demanda del día
            const DAZU = demandaExp(media_demanda, () => rng.next());
            DDEM += DAZU;

            let vendido: number, perdido: number;
            if (IAZU >= DAZU) { vendido = DAZU; perdido = 0; IAZU -= DAZU; }
            else { vendido = IAZU; perdido = DAZU - IAZU; IAZU = 0; }
            DINS += perdido;

            // Ingresos y costos del día
            IBRU += vendido * PUV;
            CTINV += IAZU * CINV;

            // Revisión semanal: pedir hasta capacidad, lead time 1–3
            if (CD % 7 === 0) {
                const PAZU = CBO - IAZU;
                if (PAZU > 0) {
                    const TENT = rng.randint(1, 3);
                    const DIT = CD + TENT;
                    ENTREGAS.push([DIT, Math.round(PAZU)]);
                    CORDET += CORDET_UNIT;
                    obs.push(`orden ${Math.round(PAZU)} kg → día ${DIT}`);
                }
            }

            emit({
                type: "step",
                name: "table:row",
                data: {
                    dia: CD,
                    invIni: Math.round(inv_ini),
                    demanda: Math.round(DAZU),
                    vendido: Math.round(vendido),
                    perdido: Math.round(perdido),
                    recibido: Math.round(recibido_hoy),
                    invFin: Math.round(IAZU),
                    obs: obs.join(", "),
                },
            });

            CD += 1;
        }

        // Totales
        const CTOT = CTADQ + CTINV + CORDET;
        const GNETA = IBRU - CTOT;
        const perdida_pct = DDEM > 0 ? (100 * DINS) / DDEM : 0;

        // 3) Resumen amigable
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
            summaryFriendly: {
                title: "Resumen",
                rows: [
                    { label: "Demanda total", value: `${Math.round(DDEM)} kg` },
                    { label: "Demanda no atendida", value: `${Math.round(DINS)} kg (${perdida_pct.toFixed(2)} %)` },
                    { label: "Ingreso bruto", value: `${IBRU.toFixed(2)} Bs` },
                    { label: "Costo de adquisición", value: `${CTADQ.toFixed(2)} Bs` },
                    { label: "Costo de inventario", value: `${CTINV.toFixed(2)} Bs` },
                    { label: "Costo por órdenes", value: `${CORDET.toFixed(2)} Bs` },
                    { label: "Costo total", value: `${CTOT.toFixed(2)} Bs` },
                    { label: "Ganancia neta", value: `${GNETA.toFixed(2)} Bs` },
                    { label: "Inventario final", value: `${Math.round(IAZU)} kg` },
                ],
            },
        } as any);
    },
};
