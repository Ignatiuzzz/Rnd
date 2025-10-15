// src/App.tsx
import { useMemo, useState } from "react";
import Runner from "../src/Runner";
import type { RunnerSpec } from "./events";

import { simP1 } from "./sims/p1"; // <- NUEVOS
import { simP2 } from "./sims/p2"; // <- NUEVOS
import { simP3 } from "./sims/p3";
import { simP4 } from "./sims/p4";
import { simP5 } from "./sims/p5";
import { simP6 } from "./sims/p6";

import "./styles.css";

export default function App() {
  // Orden sugerido: p1, p2, p3, p4, p5, p6
  const sims = useMemo<RunnerSpec[]>(
    () => [simP1, simP2, simP3, simP4, simP5, simP6],
    []
  );

  const [sel, setSel] = useState<RunnerSpec | null>(sims[0]);

  return (
    <div className="container">
      <h1>Simulaciones</h1>
      <p className="muted">Elige una simulación y mira los resultados en tiempo real.</p>

      <div className="layout">
        <aside className="sidebar">
          <div className="cards">
            {sims.map((s) => (
              <button
                key={s.id}
                className={`card ${sel?.id === s.id ? "active" : ""}`}
                onClick={() => setSel(s)}
                title={s.description}
              >
                <h3>{s.title}</h3>
                <p className="card-desc">{s.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="content">
          {sel && <Runner spec={sel} />}
        </main>
      </div>
    </div>
  );
}
