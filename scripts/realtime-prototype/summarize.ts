import { readFileSync } from 'node:fs';
import { measureReport } from './measure';

if (process.argv.length < 3) throw new Error('Usage: summarize.ts <results.json> [more results.json ...]');
for (const file of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(report.results)) throw new Error('Expected an experiment report with results[]');
  console.log(JSON.stringify({ file, ...measureReport(report) }));
}
