import type { RunnerSpec } from "../events";

/**
 * Depósito a plazo fijo con tasa anual fija:
 * - Entradas: T (años, entero >0), i (tasa anual 0..1), k0 (capital inicial >= 0)
 * - Por año: I = k * i ; k = k + I
 * - Emite tabla por año y resumen legible
 * Basado en p1.py
 */

export const simP1: RunnerSpec = {
    id: "p1",
    title: "P1 - Depósito a plazo fijo (tasa fija)",
    description: "Capitaliza anualmente con tasa fija i durante T años.",
    inputs: [
        { key: "T", label: "Años (T)", type: "int", defaultValue: 10 },
        { key: "i", label: "Tasa anual i (ej. 0.035)", type: "float", defaultValue: 0.035 },
        { key: "k0", label: "Capital inicial (k0, $)", type: "float", defaultValue: 10000 },
    ],
    async run(params, emit) {
        // ===== VALIDACIÓN =====
        const ERR: string[] = [];

        const Traw = Number(params.T);
        const iraw = Number(params.i);
        const k0raw = Number(params.k0);

        // T: entero > 0 y razonable
        const T_MAX = 10_000;
        if (!Number.isFinite(Traw)) ERR.push("«Años (T)» debe ser un número válido.");
        else if (!Number.isInteger(Traw)) ERR.push("«Años (T)» debe ser un entero (sin decimales).");
        else if (Traw <= 0) ERR.push("«Años (T)» debe ser mayor que 0.");
        else if (Traw > T_MAX) ERR.push(`«Años (T)» no puede superar ${T_MAX}.`);

        // i: 0..1 (permite 0 y 1)
        if (!Number.isFinite(iraw)) ERR.push("«Tasa anual i» debe ser un número válido.");
        else if (iraw < 0 || iraw > 1) ERR.push("«Tasa anual i» debe estar entre 0 y 1.");

        // k0: >= 0
        if (!Number.isFinite(k0raw)) ERR.push("«Capital inicial (k0)» debe ser un número válido.");
        else if (k0raw < 0) ERR.push("«Capital inicial (k0)» no puede ser negativo.");

        if (ERR.length) {
            ERR.forEach((m) => emit({ type: "stderr", line: m }));
            emit({ type: "stderr", line: "Corrige los campos y vuelve a intentar." });
            return;
        }

        const T = Math.floor(Traw);
        const i = +iraw;
        const k0 = +k0raw;

        // ===== Parámetros legibles =====
        emit({
            type: "info",
            panel: "params",
            data: [
                { label: "Años (T)", value: T },
                { label: "Tasa anual i", value: `${i}` },
                { label: "Capital inicial", value: `$ ${k0.toFixed(2)}` },
                { label: "Fórmula por año", value: "I = k · i ; k = k + I" },
            ],
        } as any);

        // ===== Tabla =====
        emit({
            type: "step",
            name: "table:init",
            data: {
                title: "Evolución anual (tasa fija)",
                columns: [
                    { key: "anio", label: "Año", align: "right" },
                    { key: "interes", label: "Interés del año ($)", align: "right" },
                    { key: "capital", label: "Capital acumulado ($)", align: "right" },
                ],
            },
        });

        let k = k0;
        for (let c = 1; c <= T; c++) {
            const I = k * i;
            k += I;

            emit({
                type: "step",
                name: "table:row",
                data: {
                    anio: c,
                    interes: Number(I.toFixed(2)),
                    capital: Number(k.toFixed(2)),
                },
            });
        }

        // ===== Resumen =====
        emit({
            type: "done",
            summary: {
                T, i, k0,
                capitalFinal: Number(k.toFixed(2)),
            },
            summaryFriendly: {
                title: "Resumen",
                rows: [
                    { label: "Años simulados", value: T },
                    { label: "Tasa anual aplicada", value: i },
                    { label: "Capital inicial", value: `$ ${k0.toFixed(2)}` },
                    { label: "Capital final", value: `$ ${k.toFixed(2)}` },
                ],
            },
        } as any);
    },
};
