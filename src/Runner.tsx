import { useMemo, useRef, useState } from "react";
import type { RunnerSpec, SimEvent } from "./events";

type Props = { spec: RunnerSpec };

export default function Runner({ spec }: Props) {
    const [log, setLog] = useState<string[]>([]);
    const formRef = useRef<HTMLFormElement>(null);
    const [running, setRunning] = useState(false);

    const defaults = useMemo(() => {
        const d: Record<string, any> = {};
        spec.inputs.forEach((f) => {
            if (f.defaultValue !== undefined) d[f.key] = f.defaultValue;
        });
        return d;
    }, [spec]);

    function append(e: SimEvent) {
        if (e.type === "stdout") setLog((L) => [...L, e.line]);
        else if (e.type === "stderr") setLog((L) => [...L, `[WARN] ${e.line}`]);
        else if (e.type === "info") setLog((L) => [...L, `> ${e.message}`]);
        else if (e.type === "step") setLog((L) => [...L, `• ${e.name}: ${JSON.stringify(e.data ?? {})}`]);
        else if (e.type === "done") setLog((L) => [...L, `✓ FIN: ${JSON.stringify(e.summary ?? {})}`]);
    }

    // --- NUEVO: helper para convertir FormData -> params tipados
    function buildParams(): Record<string, any> {
        const fd = new FormData(formRef.current!);
        const raw = Object.fromEntries(fd.entries()); // Record<string, FormDataEntryValue>
        const params: Record<string, any> = {};

        spec.inputs.forEach((f) => {
            const rawVal = raw[f.key]; // string | File
            const str = typeof rawVal === "string" ? rawVal : "";

            if (f.type === "int" || f.type === "float") {
                // manejar vacío y NaN
                const v = Number(str);
                const fallback = f.defaultValue ?? 0;
                params[f.key] = Number.isFinite(v) ? v : fallback;
            } else {
                // string
                const fallback = (f.defaultValue ?? "") as string | number;
                params[f.key] = str.length ? str : String(fallback);
            }
        });

        return params;
    }

    async function onRun(ev: React.FormEvent) {
        ev.preventDefault();
        if (running) return;
        setLog([]);
        setRunning(true);

        const params = buildParams();

        try {
            await spec.run(params, append);
        } catch (err: any) {
            append({ type: "stderr", line: String(err?.message ?? err) });
        } finally {
            setRunning(false);
        }
    }

    return (
        <div className="runner">
            <h2>{spec.title}</h2>
            <form ref={formRef} onSubmit={onRun} className="form">
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

                <button className="btn" disabled={running}>
                    {running ? "Ejecutando..." : "Ejecutar"}
                </button>
            </form>

            <pre className="console">
                {log.map((l, i) => (
                    <div key={i}>{l}</div>
                ))}
            </pre>
        </div>
    );
}
