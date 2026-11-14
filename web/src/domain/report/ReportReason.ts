export const REPORT_REASONS = ['spam', 'broken', 'offensive', 'copyright', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_DETAILS_MAX = 300;

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(value);
}
