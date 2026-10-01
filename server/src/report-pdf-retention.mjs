export async function cleanupExpiredReportPdfs({
  reportPdfStore,
  reportStore,
  withReportLock,
  now = Date.now(),
}) {
  const expiredIds = await reportPdfStore.listExpiredIds(now);
  const removedIds = [];

  for (const id of expiredIds) {
    await withReportLock(id, async () => {
      if (!(await reportPdfStore.isExpired(id, now))) return;

      // Hide the link first. If file deletion fails transiently, the next cleanup
      // can retry without exposing a known-expired PDF to the app.
      await reportStore.clearPdfUrl(id);
      if (await reportPdfStore.remove(id)) removedIds.push(id);
    });
  }

  return removedIds;
}
