import React from 'react';
import { LegalPolicyTab } from './LegalComplianceModal';

interface FooterProps {
  onOpenLegal: (tab: LegalPolicyTab) => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer" role="contentinfo">
      <div className="footer-top">
        <div className="footer-brand-info">
          <span className="footer-logo">DocuStratum Studio</span>
          <span className="footer-tagline">Deterministic DOM Stratification &amp; Grounded RAG</span>
        </div>
        <div className="footer-badge-wrap">
          <span className="badge-local-only" title="All processing occurs on-device. Zero telemetry or external analytics.">
            🔒 100% On-Device Execution
          </span>
        </div>
      </div>

      <nav className="footer-nav" aria-label="Legal & Information Links">
        <button
          type="button"
          className="footer-link-btn"
          onClick={() => onOpenLegal('privacy')}
        >
          Privacy Policy
        </button>
        <span className="footer-sep" aria-hidden="true">•</span>
        <button
          type="button"
          className="footer-link-btn"
          onClick={() => onOpenLegal('terms')}
        >
          Terms of Service
        </button>
        <span className="footer-sep" aria-hidden="true">•</span>
        <button
          type="button"
          className="footer-link-btn"
          onClick={() => onOpenLegal('cookies')}
        >
          Cookie Policy
        </button>
        <span className="footer-sep" aria-hidden="true">•</span>
        <button
          type="button"
          className="footer-link-btn"
          onClick={() => onOpenLegal('refund')}
        >
          Refund Policy
        </button>
        <span className="footer-sep" aria-hidden="true">•</span>
        <a
          href="mailto:support@docustratum.local"
          className="footer-link"
          title="Send an email to support"
        >
          Contact Support
        </a>
      </nav>

      <div className="footer-bottom">
        <p className="copyright-text">
          &copy; {currentYear} DocuStratum Studio. Released under the MIT License.
        </p>
      </div>
    </footer>
  );
};
