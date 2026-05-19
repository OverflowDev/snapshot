const fs = require('fs');
const path = require('path');

function toCSV(data) {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const escape = val => {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const rows = data.map(row => headers.map(h => escape(row[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

async function writeOutput(data, outputPath) {
  const dir = path.dirname(outputPath);
  if (dir && dir !== '.') {
    fs.mkdirSync(dir, { recursive: true });
  }

  const ext = path.extname(outputPath).toLowerCase();

  if (ext === '.json') {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  } else {
    fs.writeFileSync(outputPath, toCSV(data), 'utf8');
  }
}

module.exports = { writeOutput };
