import type { DistributionData } from "../state/useDistributionStore";
import type { DistCustomer } from "../types";
import { round2, toDayKey } from "../domain/engine";
import {
  reportClosureLabel,
  reportDate,
  reportDateTime,
  reportMovementLabel,
  reportPaymentLabel,
  reportPersonName,
  reportQuantity,
  reportReceiptNumber,
  reportRecordName,
  reportUnitLabel,
} from "../domain/reportLabels";
import { exportReportExcel, exportReportPdf } from "../../../core/reports/reportExport.ts";
import type { ReportSheet } from "../../../core/reports/reportTypes.ts";
import { buildBusinessDocumentContext } from "../../../core/businessIdentity.ts";
import type { BusinessDocumentContext } from "../../../core/businessIdentity.ts";
import { analyzeCustomerStatement } from "../domain/customerStatement.ts";
import { assertCompleteStatementHistory } from "./statementPaging.ts";
type Cell = string | number | null;
export type { ReportSheet } from "../../../core/reports/reportTypes.ts";
export function reportSheets(
  data: DistributionData,
  days: string[],
  route = "",
  seller = "",
): ReportSheet[] {
  const inScope = (r: {
    dayKey?: string;
    createdAt: string;
    routeId?: string;
  }) =>
    days.includes(r.dayKey || toDayKey(r.createdAt)) &&
    (!route || r.routeId === route);
  const sales = data.sales.filter(
      (s) =>
        inScope(s) &&
        !s.pendingConfirmation &&
        (!seller || s.sellerUid === seller),
    ),
    credits = data.receivables.filter(
      (r) => inScope(r) && (!seller || r.distributorUid === seller),
    ),
    collections = data.collections.filter(
      (r) =>
        !r.pendingConfirmation &&
        inScope(r) &&
        (!seller || r.collectedByUid === seller),
    ),
    expenses = data.expenses.filter(
      (r) =>
        !r.pendingConfirmation &&
        inScope(r) &&
        (!seller || r.registeredByUid === seller),
    );
  const claims = data.claims.filter(
    (c) =>
      inScope(c) &&
      (!seller ||
        data.sales.some((s) => s.id === c.saleId && s.sellerUid === seller)),
  );
  const lines = sales.flatMap((s) => s.lines.map((l) => ({ ...l, sale: s })));
  const losses = data.movements
    .filter(inScope)
    .filter(
      (m) =>
        m.type === "shortage" ||
        (m.type === "adjustment" && m.centralDelta < 0),
    );
  const lossCost = round2(losses.reduce((n, l) => n + (l.lossCost || 0), 0));
  const costKnown =
    lines.every((l) => typeof l.costTotal === "number") &&
    claims.every((c) => typeof c.additionalCost === "number") &&
    losses.every((m) => typeof m.lossCost === "number");
  const revenue = round2(
      sales.reduce((n, s) => n + s.total, 0) +
        claims.reduce((n, c) => n + c.revenueDelta, 0),
    ),
    cost = round2(
      lines.reduce((n, l) => n + (l.costTotal || 0), 0) +
        claims.reduce((n, c) => n + (c.additionalCost || 0), 0),
    ),
    spent = round2(expenses.reduce((n, e) => n + e.amount, 0));
  const warehouseName = (id?: string) => {
    if (!id || id === "central") return "Almacén central";
    return reportRecordName(
      data.warehouses.find((warehouse) => warehouse.id === id)?.name,
      "Almacén registrado",
    );
  };
  const locationName = (location?: string) => {
    if (!location) return "Sin ubicación indicada";
    if (location === "central") return "Almacén central";
    if (location.startsWith("warehouse__")) return warehouseName(location.slice(11));
    if (location.startsWith("route__")) {
      return reportRecordName(
        data.routes.find((item) => item.id === location.slice(7))?.name,
        "Ruta registrada",
      );
    }
    return "Ubicación registrada";
  };
  return [
    {
      name: "Resumen",
      headers: ["Concepto", "Importe (Bs)"],
      rows: [
        ["Ventas netas de cambios y devoluciones", revenue],
        ["Costo de lo vendido y reemplazos", costKnown ? cost : null],
        ["Margen bruto", costKnown ? round2(revenue - cost) : null],
        ["Gastos registrados", spent],
        ["Pérdidas de inventario", costKnown ? lossCost : null],
        [
          "Resultado operativo",
          costKnown ? round2(revenue - cost - spent - lossCost) : null,
        ],
        [
          "Estado de costos",
          costKnown
            ? "Costos completos"
            : "Hay ventas históricas sin costo; no se estima una ganancia falsa",
        ],
      ],
    },
    {
      name: "Ventas",
      headers: [
        "Fecha y hora",
        "Comprobante",
        "Vendedor",
        "Ruta",
        "Cliente",
        "CI",
        "Efectivo (Bs)",
        "QR (Bs)",
        "Crédito (Bs)",
        "Total (Bs)",
      ],
      rows: sales.map((s) => [
        reportDateTime(s.createdAt),
        reportReceiptNumber(s.id),
        reportPersonName(s.sellerName),
        reportRecordName(s.routeName, "Ruta registrada"),
        s.customerName || "Contado",
        s.customerCode || "",
        s.cashAmount,
        s.qrAmount,
        s.creditAmount,
        s.total,
      ]),
    },
    {
      name: "Productos vendidos",
      headers: [
        "Fecha",
        "Comprobante",
        "Producto",
        "Cantidad",
        "Unidad",
        "Precio (Bs)",
        "Importe (Bs)",
        "Costo (Bs)",
        "Lotes",
      ],
      rows: lines.map((l) => [
        reportDate(l.sale.dayKey),
        reportReceiptNumber(l.sale.id),
        l.productNameSnapshot,
        l.quantity,
        reportUnitLabel(l.unitType, l.unitLabel),
        l.actualUnitPrice,
        l.subtotal,
        l.costTotal ?? null,
        l.allocations?.map((a) => `${a.lotCode}: ${a.quantity}`).join("; ") ||
          "Sin datos históricos",
      ]),
    },
    {
      name: "Créditos",
      headers: [
        "Fecha",
        "Cliente",
        "CI",
        "Productos",
        "Original (Bs)",
        "Pagado (Bs)",
        "Compensado por devolución (Bs)",
        "Saldo (Bs)",
        "Estado",
      ],
      rows: credits.map((r) => [
        reportDateTime(r.createdAt),
        r.customerName,
        r.customerCode || "",
        r.saleLines
          ?.map((l) => `${l.productNameSnapshot} (${reportQuantity(l.quantity, l.unitType, l.unitLabel)})`)
          .join("; ") || "",
        r.originalAmount,
        r.paidAmount,
        r.creditedAmount || 0,
        r.balance,
        r.balance <= 0 ? "Pagado" : r.paidAmount > 0 ? "Parcial" : "Pendiente",
      ]),
    },
    {
      name: "Cobros",
      headers: [
        "Fecha",
        "Cliente",
        "CI",
        "Responsable",
        "Método",
        "Importe (Bs)",
      ],
      rows: collections.map((c) => [
        reportDateTime(c.createdAt),
        c.customerName,
        c.customerCode || "",
        reportPersonName(c.collectedByName),
        reportPaymentLabel(c.method),
        c.amount,
      ]),
    },
    {
      name: "Gastos",
      headers: ["Fecha", "Ruta", "Responsable", "Concepto", "Importe (Bs)"],
      rows: expenses.map((e) => [
        reportDateTime(e.createdAt),
        reportRecordName(e.routeName, "Ruta registrada"),
        reportPersonName(e.registeredByName),
        e.concept,
        e.amount,
      ]),
    },
    {
      name: "Arqueos",
      headers: [
        "Fecha",
        "Distribuidor",
        "Ruta",
        "Estado",
        "Esperado (Bs)",
        "Declarado (Bs)",
        "Diferencia (Bs)",
      ],
      rows: data.closures
        .filter(inScope)
        .filter((c) => !seller || c.distributorUid === seller)
        .map((c) => [
          reportDateTime(c.createdAt),
          reportPersonName(c.distributorName),
          reportRecordName(c.routeName, "Ruta registrada"),
          reportClosureLabel(c.status),
          c.expectedCash ?? null,
          c.physicalCashDeclared ?? null,
          c.cashDifference ?? null,
        ]),
    },
    {
      name: "Inventario por lote",
      headers: [
        "Producto",
        "Lote",
        "Elaboración",
        "Vencimiento",
        "Ubicación",
        "Cantidad",
        "Unidad",
        "Estado",
      ],
      rows: data.lots.flatMap((l) =>
        Object.entries(l.quantities)
          .filter(([, q]) => q > 0)
          .map(
            ([loc, q]) =>
              [
                l.productName,
                l.lotCode,
                l.manufacturedOn,
                l.expiresOn,
                locationName(loc),
                q,
                reportUnitLabel(l.unitType),
                l.quarantined
                  ? "Separado"
                  : l.expiresOn &&
                      l.expiresOn < new Date().toLocaleDateString("en-CA")
                    ? "Vencido"
                    : "Disponible",
              ] as Cell[],
          ),
      ),
    },
    {
      name: "Movimientos",
      headers: [
        "Fecha",
        "Producto",
        "Tipo",
        "Cantidad",
        "Unidad",
        "Responsable",
        "Motivo",
      ],
      rows: data.movements
        .filter(inScope)
        .map((m) => [
          reportDateTime(m.createdAt),
          m.productName,
          reportMovementLabel(m.type),
          m.quantity,
          reportUnitLabel(m.unitType),
          reportPersonName(m.responsibleName || m.createdBy),
          m.note || "",
        ]),
    },
    {
      name: "Transferencias",
      headers: [
        "Fecha",
        "Origen",
        "Destino",
        "Producto",
        "Cantidad",
        "Unidad",
        "Responsable",
      ],
      rows: data.transfers
        .filter((t) => days.includes(toDayKey(t.createdAt)))
        .map((t) => [
          reportDateTime(t.createdAt),
          warehouseName(t.fromWarehouseId),
          warehouseName(t.toWarehouseId),
          t.line.productName,
          t.line.quantity,
          reportUnitLabel(t.line.unitType),
          reportPersonName(t.responsibleName || t.createdBy),
        ]),
    },
    {
      name: "Cambios y devoluciones",
      headers: [
        "Fecha",
        "Cliente",
        "Producto",
        "Cantidad",
        "Unidad",
        "Motivo",
        "Reemplazo",
        "Ajuste de venta (Bs)",
        "Costo adicional (Bs)",
        "Deuda compensada (Bs)",
      ],
      rows: claims.map((c) => [
        reportDateTime(c.createdAt),
        c.customerName,
        c.productName,
        c.quantity,
        reportUnitLabel(c.unitType),
        c.reason,
        c.replacement?.productName || "",
        c.revenueDelta,
        c.additionalCost,
        c.debtReduction,
      ]),
    },
  ];
}
export async function exportExcel(sheets: ReportSheet[], description: string, identity?: BusinessDocumentContext) {
  return exportReportExcel(sheets, { identity: identity || buildBusinessDocumentContext(undefined, { companyName: 'PACHAX', branchName: 'Sucursal principal' }), description });
}
export async function exportPdf(
  sheets: ReportSheet[],
  description: string,
  filename = "Pachax-reportes.pdf",
  identity?: BusinessDocumentContext,
) {
  return exportReportPdf(sheets, { identity: identity || buildBusinessDocumentContext(undefined, { companyName: 'PACHAX', branchName: 'Sucursal principal' }), description, filename });
}
export async function exportCustomerStatement(
  customer: DistCustomer,
  history: { receivables: DistributionData["receivables"]; collections: DistributionData["collections"]; claims: DistributionData["claims"]; sales: DistributionData["sales"]; complete?: boolean },
  format: "PDF" | "Excel",
) {
  assertCompleteStatementHistory(history)
  if (history.receivables.some(r => r.pendingConfirmation) || history.collections.some(c => c.pendingConfirmation)) throw new Error('Espera la confirmación de las operaciones pendientes antes de exportar el estado de cuenta.')
  const analysis = analyzeCustomerStatement(history.receivables, history.collections, history.claims, history.sales)
  const reconciliationNote = analysis.reconciled
    ? 'Historial conciliado con la cartera actual'
    : `REVISAR: progresivo Bs ${analysis.ledgerBalance.toFixed(2)}; cartera actual Bs ${analysis.currentBalance.toFixed(2)}`
  const sheets: ReportSheet[] = [{
    name: "Estado de cuenta",
    headers: ["Fecha y hora", "Movimiento", "Referencia", "Ruta", "Detalle", "Método", "Debe (Bs)", "Haber (Bs)", "Saldo progresivo (Bs)", "Observaciones"],
    rows: [
      ...analysis.movements.map(row => [reportDateTime(row.at), row.kind === 'credit' ? 'Venta a crédito' : row.kind === 'payment' ? 'Cobranza' : 'Ajuste', row.reference, row.route, row.detail, row.method, row.debit, row.credit, row.balance, [row.warning, row.note].filter(Boolean).join(' · ')] as Cell[]),
      ...analysis.warnings.map(warning => ["ALERTA DE INTEGRIDAD", "", "", "", "", "", null, null, null, warning] as Cell[]),
      ["SALDO PENDIENTE ACTUAL", "", "", "", "", "", null, null, analysis.currentBalance, reconciliationNote],
    ],
  }]
  const description = `${customer.name} · CI ${customer.identityNumber || "pendiente"} · ${customer.phone || ""} · ${customer.address || ""} · emitido ${new Date().toLocaleDateString("es-BO")}`
  if (format === 'Excel') await exportExcel(sheets, description)
  else await exportPdf(sheets, description, "Pachax-estado-cuenta.pdf")
}
