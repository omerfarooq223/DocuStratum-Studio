import React, { useEffect, useRef } from 'react';

export type LegalPolicyTab = 'privacy' | 'terms' | 'cookies' | 'refund';

interface LegalComplianceModalProps {
  isOpen: boolean;
  activeTab: LegalPolicyTab;
  onTabChange: (tab: LegalPolicyTab) => void;
  onClose: () => void;
}

export const LegalComplianceModal: React.FC<LegalComplianceModalProps> = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus close button on open
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-content legal-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="legal-modal-title-wrap">
            <h2 id="legal-modal-title" className="modal-title">
              Legal & Compliance Center
            </h2>
            <span className="badge-compliance">100% Local • Zero Telemetry</span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn-close-modal"
            onClick={onClose}
            aria-label="Close legal compliance dialog"
          >
            ✕
          </button>
        </div>

        {/* Policy Tab Navigation */}
        <nav className="legal-tabs-nav" aria-label="Legal Policies Navigation">
          <button
            type="button"
            className={`legal-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => onTabChange('privacy')}
            aria-selected={activeTab === 'privacy'}
            role="tab"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            className={`legal-tab-btn ${activeTab === 'terms' ? 'active' : ''}`}
            onClick={() => onTabChange('terms')}
            aria-selected={activeTab === 'terms'}
            role="tab"
          >
            Terms & Conditions
          </button>
          <button
            type="button"
            className={`legal-tab-btn ${activeTab === 'cookies' ? 'active' : ''}`}
            onClick={() => onTabChange('cookies')}
            aria-selected={activeTab === 'cookies'}
            role="tab"
          >
            Cookie & Storage Policy
          </button>
          <button
            type="button"
            className={`legal-tab-btn ${activeTab === 'refund' ? 'active' : ''}`}
            onClick={() => onTabChange('refund')}
            aria-selected={activeTab === 'refund'}
            role="tab"
          >
            Refund & Commercial Policy
          </button>
        </nav>

        {/* Policy Body */}
        <div className="legal-policy-body" tabIndex={0}>
          {activeTab === 'privacy' && (
            <article className="policy-section">
              <h3>DocuStratum Studio Privacy Policy</h3>
              <p className="policy-meta">Effective Date: September 2026 • Version 1.0.0</p>
              
              <div className="policy-card highlight-card">
                <strong>Core Privacy Guarantee:</strong> DocuStratum Studio is an open-source, local-first engineering tool. All DOM tree traversal, text normalization, dual chunking, embedding generation, and vector retrieval execute directly on your local machine. Zero webpage data, user queries, or vector embeddings are transmitted to any remote analytics or telemetry servers.
              </div>

              <h4>1. Information Processed Locally</h4>
              <p>
                When you initiate a DOM capture, DocuStratum extracts textual blocks, heading hierarchies, CSS selectors, and SHA-256 content hashes strictly from the active browser tab that you have explicitly selected. This data is held in browser memory and, if permitted, temporarily saved in local browser storage (<code>chrome.storage.local</code>) to allow recovery across sidepanel sessions.
              </p>

              <h4>2. Form Inputs & Secrets Exclusion</h4>
              <p>
                The DOM extraction engine includes built-in security filters that automatically skip and sanitize password fields, authentication tokens, hidden form inputs, script tags, and sensitive attributes before blocks are ingested.
              </p>

              <h4>3. Optional Third-Party LLM Providers</h4>
              <p>
                If you choose to enable grounded LLM generation via Groq or an OpenAI-compatible endpoint, retrieved context blocks and your prompt query are sent strictly to your designated provider API endpoint using the API key you supply in your local environment. DocuStratum Studio operates no intermediate servers and stores no user credentials remotely.
              </p>

              <h4>4. Data Retention & Erasure</h4>
              <p>
                You retain complete control over your data. Clicking <strong>Clear Draft</strong> immediately purges all stored captures and block trees from local storage.
              </p>

              <h4>5. Contact & Privacy Inquiries</h4>
              <p>
                For questions regarding data processing practices, please open an issue in the DocuStratum project repository or reach out to the project maintainers:
              </p>
              <p className="placeholder-contact">
                <strong>Maintainer Contact:</strong> <a href="mailto:privacy@docustratum.local">privacy@docustratum.local</a><br />
                <em>[TODO for Site Owner: Replace with your verified contact address or organization entity]</em>
              </p>
            </article>
          )}

          {activeTab === 'terms' && (
            <article className="policy-section">
              <h3>Terms & Conditions</h3>
              <p className="policy-meta">Effective Date: September 2026</p>

              <h4>1. Open Source License & Usage Rights</h4>
              <p>
                DocuStratum Studio is licensed under the MIT License. You are granted permission to run, inspect, modify, and distribute the software for personal or commercial development purposes, subject to the license terms.
              </p>

              <h4>2. Responsible Use & Web Scraping Ethics</h4>
              <p>
                DocuStratum Studio is an interactive developer tool intended for analyzing public documentation and permissible web content. You agree to respect the terms of service, copyright, intellectual property rights, and access controls of any websites you inspect or capture using this extension.
              </p>

              <h4>3. Limitation of Liability & Warranty Disclaimer</h4>
              <p>
                THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY.
              </p>

              <h4>4. Commercial Application</h4>
              <p className="placeholder-contact">
                <em>[TODO for Site Owner: If deploying this tool as a hosted service or commercial SaaS offering, insert your formal organization details, dispute resolution forum, and governing jurisdiction.]</em>
              </p>
            </article>
          )}

          {activeTab === 'cookies' && (
            <article className="policy-section">
              <h3>Cookie & Local Storage Policy</h3>
              <p className="policy-meta">Effective Date: September 2026</p>

              <div className="policy-card">
                <strong>Zero Tracking Cookies Notice:</strong> DocuStratum Studio does not use advertising cookies, marketing pixels, social trackers, third-party analytics cookies, or session-recording scripts.
              </div>

              <h4>1. What Technologies We Use</h4>
              <p>
                DocuStratum Studio exclusively uses functional, on-device browser storage mechanisms:
              </p>
              <ul>
                <li>
                  <strong><code>chrome.storage.local</code>:</strong> Stores the most recent capture draft, block inclusions, and retrieval settings so your work is preserved if the side panel is closed.
                </li>
                <li>
                  <strong>In-Memory State:</strong> Active vector embeddings and search indices are kept in memory and cleared upon closing the session.
                </li>
              </ul>

              <h4>2. Managing Your Local Storage</h4>
              <p>
                You can clear all stored data at any time by clicking the <strong>Clear Draft</strong> button in the application header or by resetting extension storage in your browser settings.
              </p>
            </article>
          )}

          {activeTab === 'refund' && (
            <article className="policy-section">
              <h3>Refund & Commercial Policy</h3>
              <p className="policy-meta">Effective Date: September 2026</p>

              <div className="policy-card">
                <strong>Free Open-Source Software:</strong> The core DocuStratum Studio extension and companion service are 100% free, open-source software. There are no recurring subscriptions, hidden fees, or credit card charges required to run the application.
              </div>

              <h4>1. Software Purchases</h4>
              <p>
                Because this software is distributed free of charge under the MIT License, standard financial refund terms are not applicable to the base distribution.
              </p>

              <h4>2. Commercial & Enterprise Support Notice</h4>
              <p className="placeholder-contact">
                <em>[TODO for Site Owner: If you plan to sell commercial licenses, priority enterprise support contracts, or cloud-hosted tiers, specify your exact refund window (e.g., 14-day or 30-day money-back guarantee), cancellation procedures, and support contact information here.]</em>
              </p>
            </article>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-primary-action"
            onClick={onClose}
          >
            I Understand & Accept
          </button>
        </div>
      </div>
    </div>
  );
};
