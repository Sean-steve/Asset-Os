/** Canonical 60-screen inventory. Phase 1 (01–10) implemented as frontend workflows. */
export const phaseNames = [
  'Dashboard & Asset Registry',
  'Lifecycle, Acquisition & Ownership',
  'Valuation, Financing & Economics',
  'Operations & Protection',
  'Portfolio & Intelligence',
  'Kernel Integration & Administration',
] as const

export const screens = [
  ['Asset Command Center Dashboard','My Assets — Registry','Asset Details — Overview','Create Asset','Edit Asset','Classification Directory','Asset Tags and Collections','Advanced Asset Search','Asset Activity Timeline','Asset-Specific Detail Views'],
  ['Acquisition Center','Asset Acquisition Wizard','Acquisition Record','Cost Basis Breakdown','Asset Lifecycle Manager','Ownership Center','Ownership Details','Assign and Transfer Ownership','Asset Disposal Wizard','Disposition and Archive History'],
  ['Valuation Center','Valuation Details and Evidence','Record or Review Valuation','Valuation History and Trends','Financing Center','Financing Details and Balance History','Asset Income and Expenses','Cash Flow and Yield Analysis','Equity, ROI and Performance','Finance Reconciliation'],
  ['Maintenance Center','Maintenance Plans','Maintenance Events and Work Orders','Insurance Center','Insurance Policy Details and Renewal','Asset Utilization Dashboard','Utilization Details and Telemetry','Documents and Evidence Vault','Asset Locations and Relationships','Operational Calendar'],
  ['Portfolio Directory','Portfolio Details','Asset Allocation and Concentration','Asset Comparison','Performance Intelligence Center','Risk Management Center','Risk Assessment Details','Underperforming Assets','Forecasting and Scenario Analysis','Asset AI Intelligence Assistant'],
  ['Net Worth and Wealth OS Interface','Personal Kernel Action Center','Notifications and Reminders','Reports and Exports','Integration Hub','Integration Connection Details','Team and Access Management','Security and Audit Center','Workspace Settings','Onboarding and Empty-State Experience'],
].flatMap((group, phaseIndex) => group.map((title, screenIndex) => ({
  id: phaseIndex * 10 + screenIndex + 1,
  phase: phaseIndex + 1,
  title,
  status: phaseIndex===0 ? 'implemented' as const : 'planned' as const,
})))
export const phaseScreenCount = 10
