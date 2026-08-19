import {
  ExportPackageRequest,
  PackageValidationReport,
} from '../../../../packages/schema';

const SERVICE_BASE_URL = 'http://127.0.0.1:8000';

export async function exportRAGPackage(
  payload: ExportPackageRequest
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${SERVICE_BASE_URL}/export/package`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = `Export failed with HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) {
        errorMsg = errJson.error.message;
      } else if (errJson.detail) {
        errorMsg = errJson.detail;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = 'webrag-portable-package.zip';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = await response.blob();
  return { blob, filename };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function validatePackageBlob(blob: Blob): Promise<PackageValidationReport> {
  const response = await fetch(`${SERVICE_BASE_URL}/package/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
    },
    body: blob,
  });

  if (!response.ok) {
    let errorMsg = `Validation failed with HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) {
        errorMsg = errJson.error.message;
      } else if (errJson.detail) {
        errorMsg = errJson.detail;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return response.json();
}
