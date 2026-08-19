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
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportName, setLastExportName] = useState<string | null>(null);
  const [validationReport, setValidationReport] = useState<PackageValidationReport | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
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
      setExportError(err.message || 'Package validation failed.');
    } finally {
      setIsValidating(false);
    }
  };

  const includedBlocksCount = captureResult.blocks.filter((b) => b.included !== false).length;

  return (
    <div className="export-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Info */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#f8fafc' }}>
          📦 Portable RAG Package (Vendor-Neutral)
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.4' }}>
          Generate a standardized, cryptographically signed ZIP artifact containing raw blocks, deterministic chunks,
          evaluation benchmarks, and grounded answers for external consumption.
        </p>
      </div>

      {/* Package Contents Breakdown */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#cbd5e1' }}>Package Manifest Contents:</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
          <div style={{ background: '#1e293b', padding: '8px 10px', borderRadius: '4px' }}>
            <span style={{ color: '#64748b' }}>📄 Cleaned Markdown:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>source/cleaned.md</strong>
          </div>
          <div style={{ background: '#1e293b', padding: '8px 10px', borderRadius: '4px' }}>
            <span style={{ color: '#64748b' }}>🧱 Semantic Blocks:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>{includedBlocksCount} blocks</strong>
          </div>
          <div style={{ background: '#1e293b', padding: '8px 10px', borderRadius: '4px' }}>
            <span style={{ color: '#64748b' }}>✂️ Deterministic Chunks:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>{chunks.length} chunks</strong>
          </div>
          <div style={{ background: '#1e293b', padding: '8px 10px', borderRadius: '4px' }}>
            <span style={{ color: '#64748b' }}>❓ Evaluation Benchmark:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>{questions.length} questions</strong>
          </div>
          <div style={{ background: '#1e293b', padding: '8px 10px', borderRadius: '4px' }}>
            <span style={{ color: '#64748b' }}>🔍 Retrieval Runs:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>{retrievalResults.length} runs</strong>
          </div>
          <div style={{ background: '#1e293b', padding: '8px 10px', borderRadius: '4px' }}>
            <span style={{ color: '#64748b' }}>💬 Grounded Answers:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>{answers.length} answers</strong>
          </div>
        </div>
      </div>

      {/* Vector Omission & Reproducibility Notice */}
      <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '6px', padding: '12px', fontSize: '12px', color: '#bae6fd' }}>
        <strong>💡 Vector Omission Guarantee:</strong> Dense embedding vectors are intentionally omitted from the portable package to maintain a lightweight footprint. Downstream scripts regenerate vectors deterministically using <code>all-MiniLM-L6-v2</code> (384d, cosine) as specified in <code>manifest.json</code>.
      </div>

      {/* Export Action */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || chunks.length === 0}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '13px',
            cursor: chunks.length === 0 ? 'not-allowed' : 'pointer',
            opacity: isExporting ? 0.7 : 1,
          }}
        >
          {isExporting ? '⏳ Packaging & Validating...' : '📥 Export Portable RAG Package (.zip)'}
        </button>

        <label
          style={{
            padding: '10px 14px',
            backgroundColor: '#334155',
            color: '#f8fafc',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isValidating ? 'Checking...' : '🔍 Validate ZIP'}
          <input
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {exportError && (
        <div style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: '6px', padding: '10px', color: '#fecaca', fontSize: '12px' }}>
          <strong>Error:</strong> {exportError}
        </div>
      )}

      {/* Validation Report Card */}
      {validationReport && (
        <div style={{
          background: validationReport.valid ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          border: `1px solid ${validationReport.valid ? '#22c55e' : '#ef4444'}`,
          borderRadius: '8px',
          padding: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: validationReport.valid ? '#4ade80' : '#f87171' }}>
              {validationReport.valid ? '✅ Package Passed All Validation Gates' : '❌ Validation Errors Detected'}
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {lastExportName}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', gap: '14px' }}>
            <span>Files: <strong>{validationReport.totalFiles}</strong></span>
            <span>Blocks: <strong>{validationReport.totalBlocks}</strong></span>
            <span>Chunks: <strong>{validationReport.totalChunks}</strong></span>
            <span>Questions: <strong>{validationReport.totalQuestions}</strong></span>
            <span>Answers: <strong>{validationReport.totalAnswers}</strong></span>
          </div>

          {validationReport.issues.length > 0 && (
            <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
              {validationReport.issues.map((issue, idx) => (
                <div key={idx} style={{ fontSize: '11px', color: issue.severity === 'error' ? '#fca5a5' : '#fde047', marginBottom: '4px' }}>
                  [{issue.code}] {issue.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Downstream Loading Snippet */}
      <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
            DOWNSTREAM PYTHON CONSUMPTION
          </span>
          <span style={{ fontSize: '10px', color: '#38bdf8' }}>Zero-Dependency Loader</span>
        </div>
        <pre style={{ margin: 0, fontSize: '11px', color: '#a5f3fc', overflowX: 'auto', fontFamily: 'monospace' }}>
{`from service.packager.loader import RAGPackage

with RAGPackage.open("webrag-package.zip") as pkg:
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
  );
};
