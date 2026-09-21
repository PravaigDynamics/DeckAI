/**
 * Concrete visual brand constants, extracted directly from the sample
 * profile PDFs in brand-source/ (rendered pages inspected pixel-by-pixel
 * and embedded font names read from the PDF object streams):
 *   - Accent orange sampled from cover/background fills and product-name
 *     labels: RGB(255,103,54) / RGB(255,104,56) -> normalized to #FF6636.
 *   - Body/heading typeface embedded in both PDFs: "Open Sans" (regular,
 *     bold, and an "Open Sans Bold" variant); Calibri appears only in
 *     incidental/legacy text runs, not the brand's chosen typeface.
 *   - Footer convention present on every content page: "PRIVATE &
 *     CONFIDENTIAL | PRAVAIG <year>", small, right-aligned.
 *
 * This file is the ONE place format-specific generators (docx.ts, pptx.ts)
 * pull color/font/footer values from, so a correction like "use a darker
 * orange" changes both outputs consistently. If reviewer corrections start
 * asking for different values, prefer updating this file (and noting why)
 * over hardcoding overrides in individual generators.
 */
export const brandStyle = {
  colors: {
    /** Signature Pravaig orange, used for accents, product/pillar labels, and title emphasis. */
    accent: "FF6636",
    /** Primary body/heading text color (near-black, matches PDF body copy). */
    dark: "1A1A1A",
    /** Muted footer/metadata text color. */
    muted: "6B6B6B",
    white: "FFFFFF",
  },
  fonts: {
    // "Open Sans" is the brand's chosen typeface. It renders correctly
    // wherever it's installed (incl. Google Fonts on most modern systems);
    // Word/PowerPoint fall back to a default sans if it's missing locally.
    // Bundling/embedding the font file is a documented extension point.
    primary: "Open Sans",
  },
  footerText: (year: number = new Date().getFullYear()) => `PRIVATE & CONFIDENTIAL | PRAVAIG ${year}`,
};
