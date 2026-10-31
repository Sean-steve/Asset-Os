/** Illustrative records only. No real user information, ledger or connections. */
export type Asset = { id: string; name: string; category: string; subtype: string; value: number; equity: number; status: 'Active' | 'Review'; icon: string; color: string; currency?: string }
export const assets: Asset[] = [
  { id:'AST-001', name:'Riverside Apartments', category:'Real Estate', subtype:'Rental property', value:12200000, equity:8300000, status:'Active',icon:'building',color:'#428fff' },
  { id:'AST-002', name:'Toyota Hilux 2022', category:'Vehicles', subtype:'Commercial vehicle', value:3450000, equity:2650000, status:'Active',icon:'car',color:'#4ed3b0' },
  { id:'AST-003', name:'Investment Portfolio', category:'Investments', subtype:'Multi-asset', value:4950000, equity:4950000, status:'Active',icon:'chart',color:'#f6c96c' },
  { id:'AST-004', name:'Business Equipment', category:'Business', subtype:'Office & equipment', value:1850000, equity:1750000, status:'Active',icon:'briefcase',color:'#ec9776' },
  { id:'AST-005', name:'Software & Domains', category:'Digital Assets', subtype:'Digital IP', value:2400000, equity:150000, status:'Review',icon:'server',color:'#a88dff' },
]
export const demoSummary = {
  value: 24850000,
  equity: 17800000,
  monthlyIncome: 486000,
  monthlyExpenses: 201000,
}
export const alerts = [
  {id:'a1', title:'Insurance expiring', detail:'Toyota Hilux · 7 days remaining', tone:'red', action:'Phase 4'},
  {id:'a2', title:'Maintenance due', detail:'Toyota Hilux · next service', tone:'orange', action:'Phase 4'},
  {id:'a3', title:'Valuation review', detail:'Riverside Apartments · 30 days', tone:'blue', action:'Phase 3'},
  {id:'a4', title:'Performance review', detail:'Software & Domains · under review', tone:'purple', action:'Phase 5'},
]
export const events = [
  {date:'NOV 04',title:'Fleet inspection', detail:'Toyota Hilux',tone:'orange'},
  {date:'NOV 09',title:'Insurance renewal',detail:'Commercial vehicle',tone:'green'},
  {date:'NOV 18',title:'Asset valuation',detail:'Riverside Apartments',tone:'purple'},
]
export const activity = [
  {title:'Valuation recorded',detail:'Riverside Apartments',when:'2 hours ago',tone:'blue'},
  {title:'Maintenance completed',detail:'Toyota Hilux',when:'Yesterday',tone:'green'},
  {title:'Asset acquired',detail:'Business Equipment',when:'3 days ago',tone:'purple'},
]
export const allocation = [
  { label:'Real Estate', pct:49, color:'#478ffa'},
  { label:'Vehicles', pct:14, color:'#45cba4'},
  { label:'Investments', pct:20, color:'#f0bf63'},
  { label:'Business', pct:7, color:'#f58c63'},
  { label:'Digital Assets', pct:10, color:'#a384f5'},
]
