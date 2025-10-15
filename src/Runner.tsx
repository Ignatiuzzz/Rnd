// src/Runner.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ParamRow, RunnerSpec, SimEvent, SummarySpec, TableColumn } from "./events";

type TableSpec = { title?: string; columns: TableColumn[]; rows: Record<string, any>[] };

type Props = { spec: RunnerSpec };

export default function Runner({ spec }: Props) {
    const formRef = useRef<HTMLFormElement>(null);
    const [running, setRunning] = useState(false);

    // Estado de UI (estructurado)
    const [paramsView, setParamsView] = useState<ParamRow[]>([]);
    const [table, setTable] = useState<TableSpec | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [summary, setSummary] = useState<SummarySpec | null>(null);

    // Pre-cargar defaults de inputs
    const defaults = useMemo(() => {
        const d: Record<string, any> = {};
        spec.inputs.forEach((f) => {
            if (f.defaultValue !== undefined) d[f.key] = f.defaultValue;
        });
        return d;
    }, [spec]);

    // -------- helpers --------
    function paramsRowsFrom(obj: Record<string, any>): ParamRow[] {
        return spec.inputs.map((f) => ({
            label: f.label,
            value:
                f.type === "float"
                    ? Number(obj[f.key] ?? "").toString() === "NaN"
                        ? String(f.defaultValue ?? "")
                        : Number(obj[f.key]).toFixed(2)
                    : obj[f.key] ?? "",
        }));
    }

    function refreshParamsFromForm() {
        if (!formRef.current) return;
        const raw = Object.fromEntries(new FormData(formRef.current).entries());
        const normalized: Record<string, any> = {};
        spec.inputs.forEach((f) => {
            const v = raw[f.key];
            const s = typeof v === "string" ? v : "";
            if (f.type === "int" || f.type === "float") {
                const n = Number(s);
                normalized[f.key] = Number.isFinite(n) ? n : f.defaultValue ?? "";
            } else {
                normalized[f.key] = s.length ? s : String(f.defaultValue ?? "");
            }
        });
        setParamsView(paramsRowsFrom(normalized));
    }

    function resetViews() {
        setWarnings([]);
        setSummary(null);
        setTable(
            spec.tablePreview ? { title: spec.tablePreview.title, columns: spec.tablePreview.columns, rows: [] } : null
        );
    }

    useEffect(() => {
        setParamsView(paramsRowsFrom(defaults));
        setTable(spec.tablePreview ? { title: spec.tablePreview.title, columns: spec.tablePreview.columns, rows: [] } : null);
        setWarnings([]);
        setSummary(null);
    }, [spec]);

    // Adaptador de eventos del runner
    function append(e: SimEvent) {
        if (e.type === "stderr") {
            setWarnings((W) => [...W, e.line]);
            return;
        }
        if (e.type === "info" && e.panel === "params" && e.data?.length) {
            setParamsView(e.data);
            return;
        }
        if (e.type === "step" && e.name === "table:init") {
            const spec = e.data;
            setTable({ title: spec.title, columns: spec.columns, rows: [] });
            return;
        }
        if (e.type === "step" && e.name === "table:row") {
            const row = e.data;
            setTable((T) => (T ? { ...T, rows: [...T.rows, row] } : T));
            return;
        }
        if (e.type === "done") {
            const s = e.summaryFriendly;
            if (s?.rows?.length) setSummary(s);
            else if (e.summary) {
                const rows: ParamRow[] = Object.entries(e.summary).map(([k, v]) => ({
                    label: toFriendly(k),
                    value: typeof v === "number" ? v : String(v),
                }));
                setSummary({ title: "Resumen", rows });
            }
            return;
        }
    }

    function toFriendly(k: string) {
        const map: Record<string, string> = {
            // P3
            totalJuegos: "Total de juegos",
            ganadosCasa: "Juegos ganados por la casa",
            perdidosCasa: "Juegos perdidos por la casa",
            porcentajeGanadosCasa: "Porcentaje de juegos ganados",
            gananciaNetaTotalBs: "Ganancia neta total (Bs)",
            // P4
            horas: "Horas simuladas",
            clientesAtendidos: "Clientes atendidos",
            articulosVendidos: "Artículos vendidos",
            ingresoTotalBs: "Ingreso total (Bs)",
            costoVariableBs: "Costo variable (Bs)",
            costoFijoBs: "Costo fijo (Bs)",
            gananciaNetaBs: "Ganancia neta (Bs)",
            // P5
            totalHuevos: "Huevos producidos (total)",
            huevosPermanecen: "Huevos que permanecen",
            huevosRotos: "Huevos rotos",
            pollosVivos: "Pollos vivos",
            pollosMuertos: "Pollos muertos",
            ingresoPromedioDiaBs: "Ingreso promedio por día (Bs)",
            ingresoNetoBs: "Ingreso neto (Bs)",
            // P6
            demandaTotalKg: "Demanda total (kg)",
            demandaInsatisfechaKg: "Demanda no atendida (kg)",
            porcentajePerdida: "Porcentaje no atendido",
            ingresoBrutoBs: "Ingreso bruto (Bs)",
            costoAdquisicionBs: "Costo de adquisición (Bs)",
            costoInventarioBs: "Costo de inventario (Bs)",
            costoOrdenesBs: "Costo por órdenes (Bs)",
            costoTotalBs: "Costo total (Bs)",
            gananciaNetaBsP6: "Ganancia neta (Bs)",
            inventarioFinalKg: "Inventario final (kg)",
            // P1/P2
            capitalFinal: "Capital final ($)",
        };
        return map[k] ?? k;
    }

    // Reglas de constraints HTML por key (no sustituyen la validación del sim, sólo ayudan en UI)
    function inputConstraints(fieldKey: string, type: "int" | "float" | "string") {
        if (type === "string") return { inputMode: "text" as const };
        // claves típicas de conteo/tiempo
        if (/(^N$|^H$|^dias$|^NMD$|^T$)/i.test(fieldKey)) return { min: 1, step: 1, inputMode: "numeric" as const };
        // dinero / costos / precios
        if (/(costo|precio|CADQ|PUV|CINV|CORDET|k0)/i.test(fieldKey)) return { min: 0, step: "any", inputMode: "decimal" as const };
        // tasas 0..1
        if (/^i$/.test(fieldKey)) return { min: 0, max: 1, step: "any", inputMode: "decimal" as const };
        // capacidades/demanda
        if (/(CBO|media_demanda)/.test(fieldKey)) return { min: 0, step: "any", inputMode: "decimal" as const };
        // genérico
        return { min: 0, step: "any", inputMode: "decimal" as const };
    }

    async function onRun(ev: React.FormEvent) {
        ev.preventDefault();
        if (running) return;
        resetViews();
        setRunning(true);
        try {
            refreshParamsFromForm();
            const fd = new FormData(formRef.current!);
            const raw = Object.fromEntries(fd.entries());
            const params: Record<string, any> = {};
            spec.inputs.forEach((f) => {
                const val = raw[f.key];
                const s = typeof val === "string" ? val : "";
                if (f.type === "int" || f.type === "float") {
                    const n = Number(s);
                    params[f.key] = Number.isFinite(n) ? n : f.defaultValue ?? 0;
                } else {
                    params[f.key] = s.length ? s : String(f.defaultValue ?? "");
                }
            });
            await spec.run(params, append);
        } catch (err: any) {
            setWarnings((W) => [...W, String(err?.message ?? err)]);
        } finally {
            setRunning(false);
        }
    }

    return (
        <div className="runner">
            <h2>{spec.title}</h2>
            <p className="muted" style={{ marginTop: -6 }}>{spec.description}</p>

            {/* FORM */}
            <form ref={formRef} onSubmit={onRun} className="form" onInput={refreshParamsFromForm} noValidate>
                {spec.inputs.map((f) => {
                    const extra = inputConstraints(f.key, f.type);
                    return (
                        <label key={f.key} className="row">
                            <span>{f.label}</span>
                            <input
                                name={f.key}
                                defaultValue={defaults[f.key] ?? ""}
                                type={f.type === "string" ? "text" : "number"}
                                step={f.type === "int" ? 1 : extra.step ?? "any"}
                                min={extra.min}
                                max={extra.max}
                                inputMode={extra.inputMode}
                                required
                            />
                        </label>
                    );
                })}
                <div style={{ gridColumn: "1 / -1" }}>
                    <button className="btn" disabled={running}>
                        {running ? "Ejecutando..." : "Ejecutar"}
                    </button>
                </div>
            </form>

            {/* Detalles (si hay) */}
            {spec.details?.length ? (
                <div className="section" aria-label="Detalles">
                    <h3 style={{ marginTop: 0 }}>Detalles</h3>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {spec.details.map((d, i) => (
                            <li key={i} style={{ lineHeight: 1.5 }}>{d}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {/* Parámetros (en vivo) */}
            {paramsView.length > 0 && (
                <div className="section" aria-label="Parámetros">
                    <h3 style={{ marginTop: 0 }}>Parámetros</h3>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr><th>Campo</th><th>Valor</th></tr>
                            </thead>
                            <tbody>
                                {paramsView.map((r, i) => (
                                    <tr key={i}><td style={{ width: 320 }}>{r.label}</td><td>{String(r.value)}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Resultados (tabla) */}
            {table && (
                <div className="section" aria-label="Resultados">
                    {table.title && <h3 style={{ marginTop: 0 }}>{table.title}</h3>}
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    {table.columns.map((c) => (
                                        <th key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {table.rows.length === 0 ? (
                                    <tr><td colSpan={table.columns.length} className="muted">Sin datos aún. Ejecuta la simulación para ver filas.</td></tr>
                                ) : (
                                    table.rows.map((r, i) => (
                                        <tr key={i}>
                                            {table.columns.map((c) => (
                                                <td key={c.key} style={{ textAlign: c.align ?? "left" }}>
                                                    {formatCell(r[c.key])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="error" role="alert">
                    {warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
            )}

            {/* Resumen */}
            {summary && (
                <div className="section" aria-label="Resumen">
                    <h3 style={{ marginTop: 0 }}>{summary.title ?? "Resumen"}</h3>
                    <div className="table-wrap">
                        <table className="table">
                            <tbody>
                                {summary.rows.map((r, i) => (
                                    <tr key={i}>
                                        <td style={{ width: 320, fontWeight: 700 }}>{r.label}</td>
                                        <td>{String(r.value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatCell(v: any) {
    if (typeof v === "number") {
        const isInt = Number.isInteger(v);
        return isInt
            ? v.toLocaleString()
            : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(v ?? "");
}
