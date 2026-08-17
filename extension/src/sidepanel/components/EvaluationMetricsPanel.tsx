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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Retrieval Metrics
        </h4>
        <span className="text-[11px] font-mono text-slate-400">
          Latency: <strong className="text-emerald-400">{latestEval?.measuredLatencyMs ?? 0} ms</strong> (local measured)
        </span>
      </div>

      {/* Current Run Metrics */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
          <span className="text-[10px] text-slate-500 uppercase font-medium">Hit@1</span>
          <div className="text-sm font-bold font-mono mt-0.5">
            {latestEval?.hitAt1 !== undefined ? (
              latestEval.hitAt1 ? <span className="text-emerald-400">1</span> : <span className="text-rose-400">0</span>
            ) : (
              <span className="text-slate-600 font-normal">N/A</span>
            )}
          </div>
        </div>
        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
          <span className="text-[10px] text-slate-500 uppercase font-medium">Hit@3</span>
          <div className="text-sm font-bold font-mono mt-0.5">
            {latestEval?.hitAt3 !== undefined ? (
              latestEval.hitAt3 ? <span className="text-emerald-400">1</span> : <span className="text-rose-400">0</span>
            ) : (
              <span className="text-slate-600 font-normal">N/A</span>
            )}
          </div>
        </div>
        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
          <span className="text-[10px] text-slate-500 uppercase font-medium">Hit@5</span>
          <div className="text-sm font-bold font-mono mt-0.5">
            {latestEval?.hitAt5 !== undefined ? (
              latestEval.hitAt5 ? <span className="text-emerald-400">1</span> : <span className="text-rose-400">0</span>
            ) : (
              <span className="text-slate-600 font-normal">N/A</span>
            )}
          </div>
        </div>
        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-center">
          <span className="text-[10px] text-slate-500 uppercase font-medium">MRR</span>
          <div className="text-sm font-bold font-mono mt-0.5">
            {latestEval?.reciprocalRank !== undefined ? (
              <span className="text-blue-400">{latestEval.reciprocalRank.toFixed(2)}</span>
            ) : (
              <span className="text-slate-600 font-normal">N/A</span>
            )}
          </div>
        </div>
      </div>

      {/* Aggregate Benchmark Summary */}
      {aggregate.totalEvaluations > 1 && (
        <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Overall ({aggregate.evaluatedWithGroundTruth}/{aggregate.totalEvaluations} with GT):</span>
          <div className="flex gap-2 font-mono text-[11px]">
            <span>H@5: <strong className="text-slate-200">{aggregate.hitAt5Rate !== null ? `${(aggregate.hitAt5Rate * 100).toFixed(0)}%` : 'N/A'}</strong></span>
            <span>MRR: <strong className="text-blue-300">{aggregate.meanReciprocalRank !== null ? aggregate.meanReciprocalRank.toFixed(2) : 'N/A'}</strong></span>
            <span>Avg: <strong className="text-emerald-300">{aggregate.avgLatencyMs}ms</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};
