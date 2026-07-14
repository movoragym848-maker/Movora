// Simple Node test to validate the data transformation used by ProgressChart.jsx
// Run with: node frontend/scripts/testProgressChart.js

function transformLogs(logs, exercise) {
  const raw = logs.filter(l => l.exercise === exercise)
    .map((l, idx, arr) => {
      const d = new Date(l.date);
      const validDate = !isNaN(d);
      const parsedWeight = Number(l.maxWeight);
      const weight = Number.isFinite(parsedWeight) ? parsedWeight : null;
      const ts = validDate ? d.getTime() : (Date.now() - (arr.length - idx) * 1000);
      const dateLabel = validDate ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : String(l.date || 'Unknown');
      return { ts, dateLabel, weight };
    })
    .filter(p => p.weight !== null && !Number.isNaN(p.weight) && p.weight > 0)
    .sort((a,b) => a.ts - b.ts);

  return raw;
}

const sampleLogs = [
  { exercise: 'Bench Press', date: new Date(Date.now() - 5*86400000).toISOString(), maxWeight: 100 },
  { exercise: 'Bench Press', date: new Date(Date.now() - 3*86400000).toISOString(), maxWeight: 95 },
  { exercise: 'Bench Press', date: 'invalid-date-string', maxWeight: 90 },
  { exercise: 'Bench Press', date: new Date(Date.now() - 1*86400000).toISOString(), maxWeight: '86' },
  { exercise: 'Bench Press', date: new Date().toISOString(), maxWeight: null }, // invalid weight
  { exercise: 'Incline Bench', date: new Date().toISOString(), maxWeight: 80 }
];

console.log('Running ProgressChart mapping test...');
const data = transformLogs(sampleLogs, 'Bench Press');
console.log('Transformed points count:', data.length);
console.log('Points:');
console.table(data.map(d => ({ ts: d.ts, dateLabel: d.dateLabel, weight: d.weight })));

if (data.length >= 2) {
  const first = data[0].weight, last = data[data.length-1].weight;
  const delta = last - first;
  const pct = first ? ((delta/first)*100).toFixed(1) : '0.0';
  console.log(`First: ${first} kg, Last: ${last} kg, Δ: ${delta.toFixed(1)} kg, %: ${pct}%`);
} else {
  console.log('Not enough data points to render chart (need 2+).');
}
