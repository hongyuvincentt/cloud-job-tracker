function backupCollections(data = {}) {
  return {
    applications: Array.isArray(data.applications) ? data.applications : [],
    interviews: Array.isArray(data.interviews) ? data.interviews : [],
    statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : []
  };
}

function backupFilename(exportedAt) {
  return `求职进度云端备份-${exportedAt.slice(0, 10)}.json`;
}

export function serializeBackup(data, exportedAt = new Date().toISOString()) {
  return JSON.stringify({
    version: 1,
    exportedAt,
    ...backupCollections(data)
  }, null, 2);
}

export function downloadBackup(data, documentRef = document) {
  const exportedAt = new Date().toISOString();
  const json = serializeBackup(data, exportedAt);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');

  anchor.href = url;
  anchor.download = backupFilename(exportedAt);
  anchor.hidden = true;
  documentRef.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
