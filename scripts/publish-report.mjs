import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function usage() {
  console.error([
    'Usage:',
    '  MARKET_PULSE_URL=https://your-app.up.railway.app \\',
    '  MARKET_PULSE_PUBLISH_KEY=your-publisher-secret \\',
    '  node scripts/publish-report.mjs <report.json> [report.pdf]',
  ].join('\n'));
}

const [, , jsonArg, pdfArg] = process.argv;
const baseUrl = process.env.MARKET_PULSE_URL?.replace(/\/$/, '');
const apiKey = process.env.MARKET_PULSE_PUBLISH_KEY?.trim();

if (!jsonArg || !baseUrl || !apiKey) {
  usage();
  process.exit(1);
}

const headers = {
  Accept: 'application/json',
  ...(apiKey ? { 'X-Market-Pulse-Key': apiKey } : {}),
};

const jsonPath = resolve(jsonArg);
const report = JSON.parse(await readFile(jsonPath, 'utf8'));

const saveResponse = await fetch(`${baseUrl}/api/reports`, {
  method: 'POST',
  headers: {
    ...headers,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(report),
});

if (!saveResponse.ok) {
  const body = await saveResponse.text();
  throw new Error(`Report upload failed (${saveResponse.status}): ${body}`);
}

const saved = await saveResponse.json();
console.log(`Saved report: ${saved.id} - ${saved.title}`);

if (pdfArg) {
  const pdf = await readFile(resolve(pdfArg));
  const pdfResponse = await fetch(
    `${baseUrl}/api/reports/${encodeURIComponent(saved.id)}/pdf`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
      },
      body: pdf,
    },
  );

  if (!pdfResponse.ok) {
    const body = await pdfResponse.text();
    throw new Error(`PDF upload failed (${pdfResponse.status}): ${body}`);
  }

  const uploaded = await pdfResponse.json();
  console.log(`Saved PDF: ${uploaded.size.toLocaleString()} bytes`);
}
