// Minimal CSV writer for "Export to Excel" features across the app.
// CSV opens natively in Excel/Google Sheets, so this avoids pulling in a
// binary .xlsx dependency just to satisfy the spec's export requirement.
export function toCsv(rows, columns) {
  const escape = (val) => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }

  const header = columns.map((c) => escape(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(','))
  return [header, ...lines].join('\r\n')
}

export function sendCsv(res, filename, rows, columns) {
  const csv = toCsv(rows, columns)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}
