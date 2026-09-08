import React from 'react';
import { RetrievalEvaluationResult } from '../../../../packages/schema';
import { AggregateMetrics } from '../utils/evaluationMetrics';

interface EvaluationMetricsPanelProps {
  latestEval?: RetrievalEvaluationResult;
  aggregate: AggregateMetrics;
}

export const EvaluationMetricsPanel: React.FC<EvaluationMetricsPanelProps> = ({
  latestEval,
  aggregate,
}) => {
  return (
    <div className="debugger-metrics-card">
      <div className="debugger-panel-header">
        <div className="debugger-title-group">
          <span className="section-label">RETRIEVAL METRICS</span>
          <span className="debugger-panel-subtitle">Single-Query & Aggregate Performance</span>
        </div>
        <span className="debugger-latency-badge">
          Local Latency: <strong>{latestEval?.measuredLatencyMs ?? 0} ms</strong>
        </span>
      </div>

      {/* Current Run Retrieval Metrics */}
      <div className="debugger-metrics-grid">
        <div className="debugger-metric-box">
          <span className="metric-box-label">Hit@1</span>
          <div className="metric-box-value">
            {latestEval?.hitAt1 !== undefined ? (
              latestEval.hitAt1 ? <span className="text-success">1</span> : <span className="text-danger">0</span>
            ) : (
              <span className="text-muted">N/A</span>
            )}
          </div>
        </div>

        <div className="debugger-metric-box">
          <span className="metric-box-label">Hit@3</span>
          <div className="metric-box-value">
            {latestEval?.hitAt3 !== undefined ? (
              latestEval.hitAt3 ? <span className="text-success">1</span> : <span className="text-danger">0</span>
            ) : (
              <span className="text-muted">N/A</span>
            )}
          </div>
        </div>

        <div className="debugger-metric-box">
          <span className="metric-box-label">Hit@5</span>
          <div className="metric-box-value">
            {latestEval?.hitAt5 !== undefined ? (
              latestEval.hitAt5 ? <span className="text-success">1</span> : <span className="text-danger">0</span>
            ) : (
              <span className="text-muted">N/A</span>
            )}
          </div>
        </div>

        <div className="debugger-metric-box">
          <span className="metric-box-label">MRR</span>
          <div className="metric-box-value">
            {latestEval?.reciprocalRank !== undefined ? (
              <span className="text-accent">{latestEval.reciprocalRank.toFixed(2)}</span>
            ) : (
              <span className="text-muted">N/A</span>
            )}
          </div>
        </div>
      </div>

      {/* RAG Triad Evaluation Metrics */}
      {latestEval?.triad && (
        <div className="debugger-triad-section">
          <div className="debugger-triad-header">
            <span className="section-label">RAG TRIAD QUALITY SCORES</span>
            <span className="debugger-triad-subtitle">TruLens / RAGAS Standards</span>
          </div>

          <div className="debugger-triad-grid">
            <div className="debugger-triad-item">
              <div className="triad-item-header">
                <span>Context Relevance</span>
                <strong className="text-indigo">{Math.round(latestEval.triad.contextRelevance * 100)}%</strong>
              </div>
              <div className="triad-progress-bar">
                <div
                  className="triad-progress-fill fill-indigo"
                  style={{ width: `${Math.round(latestEval.triad.contextRelevance * 100)}%` }}
                />
              </div>
            </div>

            <div className="debugger-triad-item">
              <div className="triad-item-header">
                <span>Groundedness</span>
                <strong className="text-emerald">{Math.round(latestEval.triad.groundedness * 100)}%</strong>
              </div>
              <div className="triad-progress-bar">
                <div
                  className="triad-progress-fill fill-emerald"
                  style={{ width: `${Math.round(latestEval.triad.groundedness * 100)}%` }}
                />
              </div>
            </div>

            <div className="debugger-triad-item">
              <div className="triad-item-header">
                <span>Answer Relevance</span>
                <strong className="text-sky">{Math.round(latestEval.triad.answerRelevance * 100)}%</strong>
              </div>
              <div className="triad-progress-bar">
                <div
                  className="triad-progress-fill fill-sky"
                  style={{ width: `${Math.round(latestEval.triad.answerRelevance * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aggregate Benchmark Summary */}
      {aggregate.totalEvaluations > 1 && (
        <div className="debugger-aggregate-strip">
          <span className="aggregate-title">
            Overall Benchmark ({aggregate.evaluatedWithGroundTruth}/{aggregate.totalEvaluations} with Ground Truth):
          </span>
          <div className="aggregate-stats">
            <span>Hit@5: <strong>{aggregate.hitAt5Rate !== null ? `${(aggregate.hitAt5Rate * 100).toFixed(0)}%` : 'N/A'}</strong></span>
            <span>MRR: <strong>{aggregate.meanReciprocalRank !== null ? aggregate.meanReciprocalRank.toFixed(2) : 'N/A'}</strong></span>
            <span>Avg Latency: <strong>{aggregate.avgLatencyMs}ms</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};
