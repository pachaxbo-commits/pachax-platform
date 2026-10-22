import type { RetailCashClosure, RetailCashMovement, RetailSale } from '../data/retailRepository'

export const RETAIL_CASH_CLOSURE_EXPORT_HEADERS = [
  'Cierre','Responsable','Ventas Bs','Efectivo total Bs','QR total Bs','Efectivo puro Bs','QR puro Bs',
  'Mixto efectivo Bs','Mixto QR Bs','Esperado Bs','Contado Bs','Diferencia Bs','Observación',
] as const

export function retailCashClosureExportRow(item:RetailCashClosure):Array<string|number>{
  return [new Date(item.closedAt).toLocaleString(),item.openedBy??'—',item.totalSalesMinor/100,item.cashSalesMinor/100,
    item.qrSalesMinor/100,(item.cashOnlySalesMinor??0)/100,(item.qrOnlySalesMinor??0)/100,(item.mixedCashMinor??0)/100,
    (item.mixedQrMinor??0)/100,item.expectedCashMinor/100,item.countedCashMinor/100,item.differenceMinor/100,item.observation??'']
}

export interface RetailReportRows {sales:RetailSale[];closures:RetailCashClosure[];movements:RetailCashMovement[];reachedLimit:boolean}
export interface RetailReportState extends RetailReportRows {loading:boolean;loaded:boolean;error:string}

export function createEmptyRetailReportState():RetailReportState{return {sales:[],closures:[],movements:[],reachedLimit:false,loading:false,loaded:false,error:''}}
export function updateRetailReportRange(state:RetailReportState):RetailReportState{void state;return createEmptyRetailReportState()}
export function startRetailReport(state:RetailReportState):RetailReportState{void state;return {...createEmptyRetailReportState(),loading:true}}
export function finishRetailReport(_state:RetailReportState,result:RetailReportRows):RetailReportState{
  if(result.reachedLimit)return {...createEmptyRetailReportState(),reachedLimit:true}
  return {...result,loading:false,loaded:true,error:''}
}
export function failRetailReport(_state:RetailReportState,error:string):RetailReportState{return {...createEmptyRetailReportState(),error}}

export function retailRangeMax(requestedMax=500):number{
  const normalized=Number.isFinite(requestedMax)?Math.floor(requestedMax):500
  return Math.min(500,Math.max(1,normalized))
}
export function retailRangeWindow<T>(rows:T[],requestedMax=500):{rows:T[];reachedLimit:boolean}{
  const maxRows=retailRangeMax(requestedMax)
  return {rows:rows.slice(0,maxRows),reachedLimit:rows.length>maxRows}
}
