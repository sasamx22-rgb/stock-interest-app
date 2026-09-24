import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getReportPdfUrl } from '@/lib/market-api';
import { Report } from '@/types/market';

function safeSegment(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'report';
}

export function reportPdfFileName(report: Report) {
  const date = Number.isFinite(Date.parse(report.publishedAt))
    ? new Date(report.publishedAt).toISOString().slice(0, 10)
    : 'report';
  return `market-pulse-${date}-${report.type}-${safeSegment(report.id)}.pdf`;
}

export async function saveReportPdf(report: Report) {
  if (!report.pdfUrl) {
    throw new Error('PDF is not attached to this report');
  }

  const url = await getReportPdfUrl(report.id, report.pdfUrl);
  if (!url) {
    throw new Error('PDF URL is unavailable');
  }

  const destination = new File(Paths.document, reportPdfFileName(report));
  const downloaded = await File.downloadFileAsync(url, destination, {
    idempotent: true,
  });

  if (!downloaded.exists || downloaded.size < 5) {
    throw new Error('Downloaded PDF is empty');
  }

  const sharingAvailable = await Sharing.isAvailableAsync();
  if (sharingAvailable) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'PDF 저장 또는 공유',
    });
  }

  return {
    uri: downloaded.uri,
    sharingAvailable,
  };
}
