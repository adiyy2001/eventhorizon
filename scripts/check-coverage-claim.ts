import { existsSync, readFileSync } from 'node:fs';

export const summaryPath = 'coverage/eventhorizon/coverage-summary.json';
const claimPattern = /line(?: |%20)coverage(?: is |-| )(\d+\.\d)/gi;

export function coverageClaims(readme: string): number[] {
  return [...readme.matchAll(claimPattern)].map((match) => Number(match[1]));
}

export function roundedToOneDecimal(percent: number): number {
  return Math.round(percent * 10) / 10;
}

export function claimProblems(readme: string, measuredLinePercent: number): string[] {
  const claims = coverageClaims(readme);
  if (claims.length === 0) {
    return ['README states no line coverage figure'];
  }
  const expected = roundedToOneDecimal(measuredLinePercent);
  return claims
    .filter((claim) => claim !== expected)
    .map(
      (claim) =>
        `README says ${String(claim)} percent, the coverage run measured ${String(expected)}`,
    );
}

interface Summary {
  total: { lines: { pct: number } };
}

const invokedDirectly = process.argv[1]?.endsWith('check-coverage-claim.ts') ?? false;

if (invokedDirectly) {
  if (!existsSync(summaryPath)) {
    console.error(`${summaryPath} is missing, run pnpm test:coverage first`);
    process.exitCode = 1;
  } else {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as Summary;
    const problems = claimProblems(readFileSync('README.md', 'utf8'), summary.total.lines.pct);
    problems.forEach((problem) => {
      console.error(problem);
    });
    console.log(problems.length === 0 ? 'coverage claim matches' : 'coverage claim is stale');
    process.exitCode = problems.length === 0 ? 0 : 1;
  }
}
