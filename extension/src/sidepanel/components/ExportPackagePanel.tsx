import React, { useState } from 'react';
import {
  CaptureResult,
  Chunk,
  TestQuestion,
  RetrievalEvaluationResult,
  GroundedAnswerResponse,
  PackageValidationReport,
} from '../../../../packages/schema';
import {
  exportRAGPackage,
  triggerBlobDownload,
  validatePackageBlob,
} from '../utils/exportClient';

interface ExportPackagePanelProps {
  captureResult: CaptureResult;
  chunks: Chunk[];
  questions?: TestQuestion[];
  retrievalResults?: RetrievalEvaluationResult[];
  answers?: GroundedAnswerResponse[];
}

export const ExportPackagePanel: React.FC<ExportPackagePanelProps> = ({
  captureResult,
  chunks,
  questions = [],
  retrievalResults = [],
  answers = [],
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<PackageValidationReport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportName, setLastExportName] = useState<string | null>(null);

  const includedBlocksCount = captureResult.blocks.filter((b) => b.included !== false).length;

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setValidationReport(null);

    try {
      const { blob, filename } = await exportRAGPackage({
        captureResult,
        chunks,
        questions,
        retrievalResults,
        answers,
        generationMetadata: {
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          promptVersion: 'v1.0.0',
        },
      });

      triggerBlobDownload(blob, filename);
      setLastExportName(filename);

      // Auto-validate exported package blob
      const report = await validatePackageBlob(blob);
      setValidationReport(report);
    } catch (err: any) {
      setExportError(err.message || 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsValidating(true);
    setExportError(null);
    try {
      const report = await validatePackageBlob(file);
      setValidationReport(report);
      setLastExportName(file.name);
    } catch (err: any) {
      setExportError(err.message || 'Validation failed.');
    } finally {
      setIsValidating(false);
      e.target.value = '';
    }
  };

  return (
    <div className="export-panel-container">
      {/* Header Info Banner */}
      <div className="export-header-card">
        <div className="export-header-meta">
          <span className="section-label">PORTABLE RAG ARTIFACT</span>
          <h3 className="export-card-title">Portable RAG Package (Vendor-Neutral)</h3>
          <p className="export-card-desc">
            Generate a standardized, cryptographically signed ZIP archive containing raw blocks, deterministic chunks,
            evaluation benchmarks, and grounded answers for external consumption.
          </p>
        </div>
        <span className="export-status-badge">100% Offline Compatible</span>
      </div>

      {/* Package Contents Breakdown */}
      <div className="export-manifest-card">
        <div className="export-manifest-header">
          <span className="section-label">PACKAGE MANIFEST CONTENTS</span>
          <span className="export-spec-tag">Spec v1.0.0</span>
        </div>
        <div className="export-manifest-grid">
          <div className="export-manifest-item">
            <span className="manifest-item-label">Cleaned Markdown</span>
            <strong className="manifest-item-value">source/cleaned.md</strong>
          </div>
          <div className="export-manifest-item">
            <span className="manifest-item-label">Semantic Blocks</span>
            <strong className="manifest-item-value">{includedBlocksCount} blocks</strong>
          </div>
          <div className="export-manifest-item">
            <span className="manifest-item-label">Deterministic Chunks</span>
            <strong className="manifest-item-value">{chunks.length} chunks</strong>
          </div>
          <div className="export-manifest-item">
            <span className="manifest-item-label">Evaluation Benchmark</span>
            <strong className="manifest-item-value">{questions.length} questions</strong>
          </div>
          <div className="export-manifest-item">
            <span className="manifest-item-label">Retrieval Runs</span>
            <strong className="manifest-item-value">{retrievalResults.length} runs</strong>
          </div>
          <div className="export-manifest-item">
            <span className="manifest-item-label">Grounded Answers</span>
            <strong className="manifest-item-value">{answers.length} answers</strong>
          </div>
        </div>
      </div>

      {/* Vector Omission & Reproducibility Notice */}
      <div className="export-notice-card">
        <span className="notice-icon" aria-hidden="true">ℹ️</span>
        <div className="notice-content">
          <strong>Vector Omission Guarantee:</strong> Dense embedding vectors are intentionally omitted from the portable package to maintain a lightweight footprint. Downstream scripts regenerate vectors deterministically using <code>all-MiniLM-L6-v2</code> (384d, cosine) as specified in <code>manifest.json</code>.
        </div>
      </div>

      {/* Export & Validation Actions */}
      <div className="export-actions-row">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || chunks.length === 0}
          className="btn-export-primary"
        >
          {isExporting ? 'Packaging & Validating…' : 'Export Portable RAG Package (.zip)'}
        </button>

        <label className="btn-export-secondary">
          {isValidating ? 'Validating…' : 'Validate Package ZIP'}
          <input
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            className="hidden-file-input"
          />
        </label>
      </div>

      {/* Error Message */}
      {exportError && (
        <div className="export-error-card" role="alert">
          <strong>Error:</strong> {exportError}
        </div>
      )}

      {/* Validation Report Card */}
      {validationReport && (
        <div className={`export-validation-card ${validationReport.valid ? 'valid' : 'invalid'}`}>
          <div className="validation-header">
            <span className="validation-status-text">
              {validationReport.valid ? 'Package Passed All Validation Gates' : 'Validation Errors Detected'}
            </span>
            {lastExportName && <span className="validation-filename">{lastExportName}</span>}
          </div>

          <div className="validation-stats-row">
            <span>Files: <strong>{validationReport.totalFiles}</strong></span>
            <span>Blocks: <strong>{validationReport.totalBlocks}</strong></span>
            <span>Chunks: <strong>{validationReport.totalChunks}</strong></span>
            <span>Questions: <strong>{validationReport.totalQuestions}</strong></span>
            <span>Answers: <strong>{validationReport.totalAnswers}</strong></span>
          </div>

          {validationReport.issues.length > 0 && (
            <div className="validation-issues-list">
              {validationReport.issues.map((issue, idx) => (
                <div key={idx} className={`validation-issue ${issue.severity}`}>
                  [{issue.code}] {issue.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Downstream Loading Snippet */}
      <div className="export-code-card">
        <div className="export-code-header">
          <span className="section-label">DOWNSTREAM PYTHON CONSUMPTION</span>
          <span className="export-spec-tag">Zero-Dependency Loader</span>
        </div>
        <div className="export-code-box">
          <pre className="export-code-pre">
{`from service.packager.loader import RAGPackage

with RAGPackage.open("docustratum-package.zip") as pkg:
    # 1. Cryptographic and referential verification
    report = pkg.validate()
    print(f"Valid: {report.valid}")
    
    # 2. Iterate chunks with complete source provenance
    for chunk in pkg.iter_chunks():
        prov = pkg.get_chunk_with_provenance(chunk["id"])
        print(f"Chunk: {chunk['id']}, Strategy: {chunk['strategy']}")
        print(f"Source Blocks: {[b['id'] for b in prov['sourceBlocks']]}")`}
          </pre>
        </div>
      </div>
    </div>
  );
};
