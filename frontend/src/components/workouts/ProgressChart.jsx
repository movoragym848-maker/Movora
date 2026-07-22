import { useLayoutEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { C } from "../../constants/data";

export default function ProgressChart({ logs, exercise }) {
  const wrapperRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);

  useLayoutEffect(() => {
    const updateWidth = () => {
      if (wrapperRef.current) {
        setChartWidth(Math.floor(wrapperRef.current.getBoundingClientRect().width));
      }
    };
    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  // Use every log entry as a separate point (preserve order). If timestamps collide
  // we add a tiny jitter by index so every point is plotted.
  const normalize = s => (String(s || "").trim().toLowerCase());
  const raw = logs.filter(l => normalize(l.exercise) === normalize(exercise))
    .map((l, idx, arr) => {
      const d = new Date(l.date);
      const validDate = !isNaN(d);
      // compute weight: prefer maxWeight, otherwise derive from sets array
      const parsedWeight = Number(l.maxWeight);
      let weight = Number.isFinite(parsedWeight) ? parsedWeight : null;
      if (weight === null && Array.isArray(l.sets) && l.sets.length > 0) {
        const setMax = Math.max(...l.sets.map(s => Number(s.weight) || 0));
        if (setMax > 0) weight = setMax;
      }
      // deterministic fallback timestamp for invalid dates: place entries slightly in the past
      const ts = validDate ? d.getTime() : (Date.now() - (arr.length - idx) * 1000);
      const dateLabel = validDate ? d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : String(l.date || "Unknown");
      return { ts, dateLabel, weight };
    })
    // exclude entries without a valid numeric weight (and ignore non-positive weights)
    .filter(p => p.weight !== null && !Number.isNaN(p.weight) && p.weight > 0)
    .sort((a,b) => a.ts - b.ts);

  const data = raw;

  if (data.length < 2) return (
    <div style={{ textAlign:"center", padding:"clamp(24px, 5vw, 36px) clamp(12px, 3vw, 20px)", color:C.muted, fontSize:"clamp(13px, 3vw, 14px)" }}>
      Log at least 2 sessions of <strong style={{ color:C.dark }}>{exercise}</strong> to see progress
    </div>
  );

  const first = data[0].weight, last = data[data.length-1].weight;
  const delta = last - first;
  const pct = first ? ((delta/first)*100).toFixed(1) : "0.0";

  return (
    <>
      <style>{`
        @media (max-width: 640px) {
          .progress-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .progress-card { padding: 8px 10px !important; }
          .progress-card-label { font-size: 9px !important; }
          .progress-card-value { font-size: 14px !important; }
          .progress-chart { height: 180px !important; }
        }
      `}</style>
      <div className="progress-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:18 }}>
        {[
          { label:"Starting",  value:`${first} kg` },
          { label:"Current",   value:`${last} kg` },
          { label:"Change",    value:`${delta>=0?"+":""}${delta.toFixed(1)} kg`, color:delta>=0 ? C.success : C.red },
          { label:"% Change",  value:`${pct}%`, color:delta>=0 ? C.success : C.red },
        ].map(m => (
          <div key={m.label} className="progress-card" style={{ background:C.surface, borderRadius:10, padding:"10px 12px" }}>
            <div className="progress-card-label" style={{ fontSize:"clamp(9px, 2vw, 10px)", color:C.muted, marginBottom:3, textTransform:"uppercase", letterSpacing:1, fontWeight:600 }}>{m.label}</div>
            <div className="progress-card-value" style={{ fontSize:"clamp(14px, 4vw, 16px)", fontWeight:800, color:m.color||C.dark, fontFamily:"'Barlow Condensed',sans-serif" }}>{m.value}</div>
          </div>
        ))}
      </div>
      <div ref={wrapperRef} className="progress-chart" style={{ width: "100%", minHeight: 200 }}>
        {chartWidth > 0 ? (
          <LineChart width={chartWidth} height={200} data={data} margin={{ top:5, right:10, left:-20, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="dateLabel" tick={{ fill:C.muted, fontSize:11 }} interval={0} />
            <YAxis tick={{ fill:C.muted, fontSize:11 }} />
            <Tooltip contentStyle={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, color:C.dark }} labelFormatter={label => label} />
            <Line type="monotone" dataKey="weight" stroke={C.primary} strokeWidth={2.5}
              dot={{ fill:C.primary, r:4 }} activeDot={{ r:6 }}/>
          </LineChart>
        ) : (
          <div style={{ width: "100%", height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
            Loading chart...
          </div>
        )}
      </div>
    </>
  );
}

// ─── CALORIE SETUP MODAL ───────────────────────────────────────────────────────
