import type { RunnerSpec } from "../events";

/**
 * Depósito a plazo fijo con tasa dependiente del capital:
 * Tramos (según k antes de capitalizar el año):
 *  - 0 .. 10,000          → 0.035
 *  - 10,000 .. 100,000    → 0.037
 *  - > 1,000,000          → 0.040
 *  - caso contrario       → 0.037
 * Secuencia por año (según p2.py):
 *   1) Seleccionar tasa i(k)
 *   2) C = C + 1
 *   3) I = k * i
 *   4) k = k + I
 * Emite tabla por año (incluye tasa usada) y resumen.
 * Basado en p2.py
 */

function tasaSegunK(k: number): number {
    if (k >= 0 && k <= 10_000) return 0.035;
    if (k > 10_000 && k <= 100_000) return 0.037;
    if (k > 1_000_000) return 0.040;
    return 0.037;
}

export const simP2: RunnerSpec = {
    id: "p2",
    title: "P2 - Depósito (tasa depende del capital)",
    description: "Capitaliza anualmente con tasa i(k) dependiente del capital actual.",
    inputs: [
        { key: "T", label: "Años (T)", type: "int", defaultValue: 10 },
        { key: "k0", label: "Capital inicial (k0, $)", type: "float", defaultValue: 10000 },
    ],
    async run(params, emit) {
        // ===== VALIDACIÓN =====
        const ERR: string[] = [];

        const Traw = Number(params.T);
        const k0raw = Number(params.k0);

        const T_MAX = 10_000;

        // T
        if (!Number.isFinite(Traw)) ERR.push("«Años (T)» debe ser un número válido.");
        else if (!Number.isInteger(Traw)) ERR.push("«Años (T)» debe ser un entero (sin decimales).");
        else if (Traw <= 0) ERR.push("«Años (T)» debe ser mayor que 0.");
        else if (Traw > T_MAX) ERR.push(`«Años (T)» no puede superar ${T_MAX}.`);

        // k0
        if (!Number.isFinite(k0raw)) ERR.push("«Capital inicial (k0)» debe ser un número válido.");
        else if (k0raw < 0) ERR.push("«Capital inicial (k0)» no puede ser negativo.");
        else if (k0raw > 1e12) ERR.push("«Capital inicial (k0)» es demasiado grande para simular.");

        if (ERR.length) {
            ERR.forEach((m) => emit({ type: "stderr", line: m }));
            emit({ type: "stderr", line: "Corrige los campos y vuelve a intentar." });
            return;
        }

        const T = Math.floor(Traw);
        const k0 = +k0raw;

        // ===== Parámetros legibles =====
        emit({
            type: "info",
            panel: "params",
            data: [
                { label: "Años (T)", value: T },
                { label: "Capital inicial", value: `$ ${k0.toFixed(2)}` },
                { label: "Regla de tasa i(k)", value: "Tramos por capital actual antes de capitalizar" },
            ],
        } as any);

        // ===== Tabla =====
        emit({
            type: "step",
            name: "table:init",
            data: {
                title: "Evolución anual (tasa depende de k)",
                columns: [
                    { key: "anio", label: "Año", align: "right" },
                    { key: "tasa", label: "Tasa aplicada i(k)", align: "right" },
                    { key: "interes", label: "Interés del año ($)", align: "right" },
                    { key: "capital", label: "Capital acumulado ($)", align: "right" },
                ],
            },
        });

        let k = k0;
        for (let C = 1; C <= T; C++) {
            // 1) elegir tasa según k (antes de capitalizar)
            const i = tasaSegunK(k);
            // 2) C = C + 1  (implícito en el for)
            // 3) I = k * i
            const I = k * i;
            // 4) k = k + I
            k += I;

            emit({
                type: "step",
                name: "table:row",
                data: {
                    anio: C,
                    tasa: Number(i.toFixed(6)),
                    interes: Number(I.toFixed(2)),
                    capital: Number(k.toFixed(2)),
                },
            });
        }

        // ===== Resumen =====
        emit({
            type: "done",
            summary: {
                T, k0,
                capitalFinal: Number(k.toFixed(2)),
            },
            summaryFriendly: {
                title: "Resumen",
                rows: [
                    { label: "Años simulados", value: T },
                    { label: "Capital inicial", value: `$ ${k0.toFixed(2)}` },
                    { label: "Capital final", value: `$ ${k.toFixed(2)}` },
                ],
            },
        } as any);
    },
};
