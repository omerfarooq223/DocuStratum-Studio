import { describe, it, expect } from 'vitest';
import { safeText } from '../dom-safety';

describe('Math Formula Extraction', () => {
  it('extracts KaTeX annotation LaTeX formula correctly', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <p>The mass-energy equivalence equation is
        <span class="katex">
          <span class="katex-mathml">
            <math xmlns="http://www.w3.org/1998/Math/MathML">
              <semantics>
                <annotation encoding="application/x-tex">E = mc^2</annotation>
              </semantics>
            </math>
          </span>
          <span class="katex-html" aria-hidden="true">
            <span class="base">E=mc^2</span>
          </span>
        </span>
        discovered by Einstein.
      </p>
    `;

    const text = safeText(container);
    expect(text).toContain('$E = mc^2$');
    expect(text).toContain('mass-energy equivalence equation');
    expect(text).toContain('discovered by Einstein');
  });

  it('extracts display-mode LaTeX formula with double dollar signs', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="katex-display">
        <span class="katex">
          <annotation encoding="application/x-tex">\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}</annotation>
        </span>
      </div>
    `;

    const text = safeText(container);
    expect(text).toContain('$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$');
  });

  it('extracts MathML with alttext attribute fallback', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <p>Let <math alttext="x^2 + y^2 = r^2"><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow></math> be a circle.</p>
    `;

    const text = safeText(container);
    expect(text).toContain('$x^2 + y^2 = r^2$');
  });
});
