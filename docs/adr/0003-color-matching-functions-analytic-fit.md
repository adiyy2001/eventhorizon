# 3. Color matching functions from an analytic fit

Status: accepted

## Context

The disk color comes from integrating a Planck spectrum against the CIE 1931 color matching functions and converting XYZ to linear sRGB. The source and license of the matching data go into `CREDITS.md`, and all dependencies must be permissive (MIT, Apache 2.0, BSD, ISC).

I checked the official CIE data table for the 1931 2 degree observer (DOI 10.25039/CIE.DS.xvudnb9b, from CIE 018:2019, table 6). Its metadata states the license as CC BY-SA 4.0. ShareAlike is a copyleft condition, which does not fit the rule for this repo. The CVRL copy of the same table carries no clear license statement.

## Decision

Evaluate the matching functions with the multi-lobe piecewise Gaussian fit from Wyman, Sloan and Shirley, "Simple Analytic Approximations to the CIE XYZ Color Matching Functions", Journal of Computer Graphics Techniques 2(2), 2013 (Table 1 and Listing 1). The code reimplements the published formula and nothing else from the paper. No table of measured data is shipped.

The temperature lookup table is computed at startup from this fit by a pure function in `src/core/color`, with the physical constants taken from CODATA 2022 (second radiation constant c2 = 1.438776877... x 10^-2 m·K, exact since the 2019 SI redefinition, from NIST) and the XYZ to linear sRGB matrix from CSS Color Module Level 4 (exact rational entries).

`CREDITS.md` states the paper, the fact that its text is under CC BY-ND 3.0 and that only the numeric coefficients are used, the CIE dataset and its license as the reference the fit was checked against, and the NIST and W3C sources.

## Alternatives

- Ship the CIE table. Most accurate, but ShareAlike is incompatible with the permissive-only rule.
- Ship the CVRL table. Unclear license.
- The single-lobe fits from the same paper. Simpler, with errors up to about 4 percent in the curves.

## Consequences

Measured during planning against the CIE table: the largest absolute difference in any matching function is 0.022 (peak value of ȳ is 1), and the chromaticity of a Planckian radiator differs by at most 0.0006 in x or y at 4000 K, 0.0002 at 6500 K and 0.0046 at 1500 K. Tests assert Planckian chromaticities against reference numbers with a tolerance of 3e-3 for T of 2500 K and above, and the lowest temperature in the LUT carries a looser documented tolerance. The reference numbers were computed once from the CIE table and agree with the published Planckian locus to about 1e-3. Only those numbers are kept, so the repo stays free of the dataset.
