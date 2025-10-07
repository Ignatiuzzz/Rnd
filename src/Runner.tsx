import { useEffect, useMemo, useRef, useState } from "react";
import type { RunnerSpec, SimEvent } from "./events";

type TableColumn = { key: string; label: string; align?: "left" | "right" | "center" };
type TableSpec = { title?: string; columns: TableColumn[]; rows: Record<string, any>[] };

type ParamRow = { label: string; value: string | number };
type SummarySpec = { title?: string; rows: ParamRow[] };
type SpecExtras = {
    details?: string[];
    tablePreview?: { title?: string; columns: TableColumn[] };
};

type Props = { spec: RunnerSpec };

export default function Runner({ spec }: Props) {
    const ex = spec as RunnerSpec & SpecExtras;

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
        setTable(ex.tablePreview ? { title: ex.tablePreview.title, columns: ex.tablePreview.columns, rows: [] } : null);
    }

    useEffect(() => {
        setParamsView(paramsRowsFrom(defaults));
        setTable(ex.tablePreview ? { title: ex.tablePreview.title, columns: ex.tablePreview.columns, rows: [] } : null);
        setWarnings([]);
        setSummary(null);
    }, [spec]);

    // Adaptador de eventos del runner
    function append(e: SimEvent) {
        if (e.type === "stderr") {
            setWarnings((W) => [...W, e.line]);
            return;
        }
        if (e.type === "info" && (e as any).panel === "params") {
            const data = (e as any).data as ParamRow[] | undefined;
            if (data?.length) setParamsView(data);
            return;
        }
        if (e.type === "step" && e.name === "table:init") {
            const spec = e.data as { title?: string; columns: TableColumn[] };
            setTable({ title: spec.title, columns: spec.columns, rows: [] });
            return;
        }
        if (e.type === "step" && e.name === "table:row") {
            const row = e.data as Record<string, any>;
            setTable((T) => (T ? { ...T, rows: [...T.rows, row] } : T));
            return;
        }
        if (e.type === "done") {
            const s = (e as any).summaryFriendly as SummarySpec | undefined;
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
            totalJuegos: "Total de juegos",
            ganadosCasa: "Juegos ganados por la casa",
            perdidosCasa: "Juegos perdidos por la casa",
            porcentajeGanadosCasa: "Porcentaje de juegos ganados",
            gananciaNetaTotalBs: "Ganancia neta total (Bs)",
            horas: "Horas simuladas",
            clientesAtendidos: "Clientes atendidos",
            articulosVendidos: "Artículos vendidos",
            ingresoTotalBs: "Ingreso total (Bs)",
            costoVariableBs: "Costo variable (Bs)",
            costoFijoBs: "Costo fijo (Bs)",
            gananciaNetaBs: "Ganancia neta (Bs)",
        };
        return map[k] ?? k;
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
            <form ref={formRef} onSubmit={onRun} className="form" onInput={refreshParamsFromForm}>
                {spec.inputs.map((f) => (
                    <label key={f.key} className="row">
                        <span>{f.label}</span>
                        <input
                            name={f.key}
                            defaultValue={defaults[f.key] ?? ""}
                            type={f.type === "string" ? "text" : "number"}
                            step={f.type === "int" ? 1 : "any"}
                        />
                    </label>
                ))}
                <div style={{ gridColumn: "1 / -1" }}>
                    <button className="btn" disabled={running}>
                        {running ? "Ejecutando..." : "Ejecutar"}
                    </button>
                </div>
            </form>

            {/* Detalles (si hay) */}
            {ex.details?.length ? (
                <div className="section" aria-label="Detalles">
                    <h3 style={{ marginTop: 0 }}>Detalles</h3>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {ex.details.map((d, i) => (
                            <li key={i} style={{ lineHeight: 1.5 }}>{d}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {/* Parámetros (siempre, en vivo) */}
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
