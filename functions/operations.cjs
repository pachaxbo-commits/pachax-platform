const { hasPermission, legacyMember, audit } = require('./authorization.cjs');
const scopeMetadata = root => ({ [root.parent.id === 'tenants' ? 'tenantId' : 'restaurantId']: root.id });
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const round = (n) => {
  const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
};
const roundAt = (n, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((Number(n) + Number.EPSILON) * factor) / factor;
};

const isSaleForDispatch = (sale, routeId) =>
  (!sale.routeId || sale.routeId === routeId) && sale.sourceLocation !== "centralWarehouse";

function splitAllocationsByAmounts(allocations, amounts) {
  const groups = amounts.map(() => []);
  let groupIndex = 0;
  let remaining = roundAt(amounts[0] || 0, 3);
  for (const allocation of allocations || []) {
    let quantity = roundAt(allocation.quantity, 3);
    while (quantity > 0.0001) {
      while (groupIndex < amounts.length && remaining <= 0.0001) {
        groupIndex += 1;
        remaining = roundAt(amounts[groupIndex] || 0, 3);
      }
      check(groupIndex < amounts.length, "No se pudieron distribuir los lotes del retorno.");
      const part = roundAt(Math.min(quantity, remaining), 3);
      if (part > 0) groups[groupIndex].push({ ...allocation, quantity: part });
      quantity = roundAt(quantity - part, 3);
      remaining = roundAt(remaining - part, 3);
    }
  }
  check(
    Math.abs(roundAt((allocations || []).reduce((sum, part) => sum + part.quantity, 0), 3) - roundAt(amounts.reduce((sum, value) => sum + value, 0), 3)) < 0.001,
    "Las asignaciones de lotes no coinciden con las cantidades recibidas."
  );
  return groups;
}
class BusinessError extends Error {}
const check = (condition, message) => {
  if (!condition) throw new BusinessError(message);
};
const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const safeId = (value) => {
  check(
    typeof value === "string" &&
      value.length > 0 &&
      value.length < 180 &&
      !value.includes("/"),
    "Identificador inválido.",
  );
  return value;
};
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
const location = (kind, id) =>
  kind === "route"
    ? `route__${safeId(id)}`
    : id && id !== "central"
      ? `warehouse__${safeId(id)}`
      : "central";
const balanceId = (loc, pid) => `${loc}__${pid}`;
class Operation {
  constructor(tx, root, command, member, id) {
    this.tx = tx;
    this.root = root;
    this.command = command;
    this.member = member;
    this.id = id;
    this.actor = command.createdBy;
    this.now = new Date().toISOString();
    this.today = dayKey();
    this.cache = new Map();
    this.writes = new Map();
    this.stock = new Map();
    this.sequence = 0;
  }
  ref(col, id) {
    return this.root.collection(col).doc(safeId(id));
  }
  async read(col, id) {
    const key = `${col}/${id}`;
    if (!this.cache.has(key)) {
      const snap = await this.tx.get(this.ref(col, id));
      const raw = snap.exists ? { ...snap.data(), id: snap.id } : null;
      const data = raw && col === "members" && this.root.parent.id === "tenants" ? legacyMember(raw) : raw;
      this.cache.set(key, data);
    }
    return this.cache.get(key);
  }
  async query(col, field, value) {
    const snap = await this.tx.get(
      this.root.collection(col).where(field, "==", value),
    );
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  }
  put(col, id, value) {
    this.writes.set(`${col}/${id}`, {
      ref: this.ref(col, id),
      data: JSON.parse(JSON.stringify(value)),
    });
  }
  base() {
    return {
      ...scopeMetadata(this.root),
      branchId: "main",
      createdAt: this.now,
      createdBy: this.actor,
      dayKey: this.today,
      schemaVersion: 2,
    };
  }
  admin() {
    check(
      this.member.role === "admin",
      "Solo Administración puede realizar esta operación.",
    );
  }
  owns(loc) {
    check(
      this.member.role === "admin" ||
        (this.member.role === "warehouse" &&
          loc === location("warehouse", this.member.warehouseId || "central")),
      "No tienes permiso para operar ese almacén.",
    );
  }
  async product(id) {
    const p = await this.read("distProducts", id);
    check(p && p.active !== false, "El producto no está activo.");
    return p;
  }
  amount(q, p, negative = false, precision = 2) {
    check(
      Number.isFinite(q) && (negative ? q !== 0 : q > 0),
      "Cantidad inválida.",
    );
    check(
      p.unitType === "kg" || Number.isInteger(q),
      "Paquetes y unidades requieren cantidades enteras.",
    );
    return roundAt(q, precision);
  }
  async loadStock(pid, loc) {
    const p = await this.read("distProducts", pid);
    check(p, "Producto inexistente.");
    if (!this.stock.has(pid)) {
      const lots = await this.query("distLots", "productId", pid);
      this.stock.set(pid, { p, lots, balances: new Map() });
    }
    const entry = this.stock.get(pid);
    if (!entry.balances.has(loc)) {
      const bal = await this.read("distBalances", balanceId(loc, pid));
      entry.balances.set(
        loc,
        bal
          ? { ...bal }
          : {
              id: balanceId(loc, pid),
              ...scopeMetadata(this.root),
              locationKind: loc.startsWith("route__") ? "route" : "central",
              ...(loc.startsWith("route__")
                ? { routeId: loc.slice(7) }
                : {
                    warehouseId: loc.startsWith("warehouse__")
                      ? loc.slice(11)
                      : "central",
                  }),
              productId: pid,
              productName: p.name,
              unitType: p.unitType,
              quantity: 0,
            },
      );
      const tracked = round(
        entry.lots.reduce((n, l) => n + (l.quantities?.[loc] || 0), 0),
      );
      const legacy = round((bal?.quantity || 0) - tracked);
      check(
        legacy >= -0.01,
        "Los lotes no coinciden con el stock. Administración debe revisar el inventario.",
      );
      if (legacy > 0) {
        const id = `legacy_${balanceId(loc, pid)}`;
        check(
          !entry.lots.some((l) => l.id === id),
          "El stock anterior necesita conciliación antes de continuar.",
        );
        entry.lots.push({
          id,
          ...scopeMetadata(this.root),
          productId: pid,
          productName: p.name,
          unitType: p.unitType,
          lotCode: "ANTERIOR SIN FECHAS",
          manufacturedOn: "",
          expiresOn: "",
          productionCost: p.productionCost ?? null,
          legacy: true,
          quantities: { [loc]: legacy },
          createdAt: this.now,
          createdBy: this.actor,
        });
      }
    }
    return entry;
  }
  move(entry, loc, delta, precision = 2) {
    const b = entry.balances.get(loc);
    b.quantity = roundAt(b.quantity + delta, precision);
    check(b.quantity >= 0, "Stock insuficiente.");
    b.updatedAt = this.now;
  }
  async take(pid, loc, quantity, { allowExpired = false, lotId, allocationsRequested, precision: requestedPrecision } = {}) {
    const e = await this.loadStock(pid, loc);
    const precision = requestedPrecision ?? (e.p.unitType === "kg" ? 3 : 2);
    quantity = roundAt(this.amount(quantity, e.p, false, precision), precision);

    if (Array.isArray(allocationsRequested)) {
      check(allocationsRequested.length > 0, "Distribuye la cantidad entre uno o más lotes.");
      const seen = new Set();
      const requested = allocationsRequested.map((part) => {
        check(part?.lotId && !seen.has(part.lotId), "No repitas el mismo lote en un producto.");
        seen.add(part.lotId);
        const requestedQuantity = roundAt(this.amount(part.quantity, e.p, false, precision), precision);
        check(requestedQuantity > 0, "La cantidad asignada a cada lote debe ser mayor a cero.");
        const lot = e.lots.find((row) => row.id === part.lotId);
        check(lot && lot.productId === pid, "El lote no pertenece al producto seleccionado.");
        check(
          allowExpired || (!lot.quarantined && (!lot.expiresOn || lot.expiresOn >= this.today)),
          "El lote está vencido o en cuarentena."
        );
        check(
          roundAt(lot.quantities?.[loc] || 0, precision) >= requestedQuantity,
          `El lote ${lot.lotCode || lot.id} no tiene cantidad suficiente.`
        );
        return { lot, quantity: requestedQuantity };
      });
      check(
        Math.abs(roundAt(requested.reduce((sum, part) => sum + part.quantity, 0), precision) - quantity) < 1 / 10 ** precision,
        "La distribución por lotes debe coincidir con la cantidad total."
      );
      const allocations = requested.map(({ lot, quantity: requestedQuantity }) => {
        lot.quantities[loc] = roundAt(lot.quantities[loc] - requestedQuantity, precision);
        return {
          lotId: lot.id,
          lotCode: lot.lotCode,
          expiresOn: lot.expiresOn,
          quantity: requestedQuantity,
          productionCost: lot.productionCost ?? null,
        };
      });
      this.move(e, loc, -quantity, precision);
      return allocations;
    }

    const lots = e.lots
      .filter(
        (l) =>
          (l.quantities?.[loc] || 0) > 0 &&
          (!lotId || l.id === lotId) &&
          (allowExpired ||
            (!l.quarantined && (!l.expiresOn || l.expiresOn >= this.today))),
      )
      .sort(
        (a, b) =>
          (a.expiresOn || "9999").localeCompare(b.expiresOn || "9999") ||
          a.id.localeCompare(b.id),
      );
    check(
      roundAt(lots.reduce((s, l) => s + (l.quantities[loc] || 0), 0), precision) >= quantity,
      `Stock apto insuficiente de ${e.p.name}. Revisa lotes vencidos o cantidades.`,
    );
    let remaining = quantity;
    const allocations = [];
    for (const l of lots) {
      if (remaining <= 0) break;
      const q = roundAt(Math.min(remaining, l.quantities[loc]), precision);
      l.quantities[loc] = roundAt(l.quantities[loc] - q, precision);
      remaining = roundAt(remaining - q, precision);
      allocations.push({
        lotId: l.id,
        lotCode: l.lotCode,
        expiresOn: l.expiresOn,
        quantity: q,
        productionCost: l.productionCost ?? null,
      });
    }
    this.move(e, loc, -quantity, precision);
    return allocations;
  }
  async moveStock(pid, from, to, q, options = {}) {
    const e = await this.loadStock(pid, from);
    await this.loadStock(pid, to);
    const precision = options.precision ?? (e.p.unitType === "kg" ? 3 : 2);
    const parts = await this.take(pid, from, q, options);
    for (const a of parts) {
      const l = e.lots.find((x) => x.id === a.lotId);
      l.quantities[to] = roundAt((l.quantities[to] || 0) + a.quantity, precision);
    }
    this.move(e, to, q, precision);
    return parts;
  }
  ledger(pid, q, from, to, type, extra = {}, requestedPrecision) {
    const e = this.stock.get(pid);
    const precision = requestedPrecision ?? (e.p.unitType === "kg" ? 3 : 2);
    const id = `${this.id}__${this.sequence++}`;
    const m = {
      id,
      ...this.base(),
      type,
      productId: pid,
      productName: e.p.name,
      unitType: e.p.unitType,
      quantity: roundAt(Math.abs(q), precision),
      fromLocation: from || "",
      toLocation: to || "",
      centralDelta: roundAt(
        (to && !to.startsWith("route__") ? q : 0) -
          (from && !from.startsWith("route__") ? q : 0),
        precision,
      ),
      routeDelta: roundAt(
        (to?.startsWith("route__") ? q : 0) -
          (from?.startsWith("route__") ? q : 0),
        precision,
      ),
      routeId: (from?.startsWith("route__")
        ? from
        : to?.startsWith("route__")
          ? to
          : ""
      ).slice(7),
      refId: this.id,
      refType: "operation",
      responsibleName: this.member.displayName || this.actor,
      responsibleRole: this.member.role,
      ...extra,
    };
    this.put("distStockMovements", id, m);
    return m;
  }
  flush() {
    for (const e of this.stock.values()) {
      for (const l of e.lots) this.put("distLots", l.id, l);
      for (const b of e.balances.values()) this.put("distBalances", b.id, b);
    }
    for (const w of this.writes.values()) this.tx.set(w.ref, w.data);
  }
}

// All administrative cash operations and the daily close read/write this
// tenant/day document in their transaction. Firestore transaction conflicts
// serialize a sale against a simultaneous close; a retry then either sees the
// sale in the close totals or sees the closed marker and is rejected.
async function assertAdministrativeDayOpen(o) {
  if (o.member.role !== "admin") return;
  const day = await o.read("distAdministrativeDays", o.today);
  check(day?.status !== "closed", "La caja administrativa de hoy ya fue cerrada. No se permiten nuevas operaciones financieras.");
  o.put("distAdministrativeDays", o.today, {
    ...(day || {}),
    id: o.today,
    ...o.base(),
    status: "open",
    lastOperationAt: o.now,
    lastOperationId: o.id,
  });
}

async function intake(o, p) {
  o.owns("central");
  check(Array.isArray(p.lines) && p.lines.length, "Agrega productos.");
  for (const line of p.lines) {
    const e = await o.loadStock(line.productId, "central");
    const q = o.amount(line.quantity, e.p);
    check(line.lotCode?.trim(), "El lote es obligatorio.");
    check(
      validDate(line.manufacturedOn) &&
        validDate(line.expiresOn),
      "Indica fechas válidas de lote y vencimiento.",
    );
    check(
      line.manufacturedOn <= o.today && line.expiresOn >= line.manufacturedOn,
      "Revisa las fechas del lote.",
    );
    check(
      Number.isFinite(e.p.productionCost) && e.p.productionCost >= 0,
      "Configura el costo de producción antes de ingresar stock.",
    );
    const id = `${o.id}__${o.sequence++}`;
    e.lots.push({
      id,
      ...scopeMetadata(o.root),
      productId: e.p.id,
      productName: e.p.name,
      unitType: e.p.unitType,
      lotCode: line.lotCode.trim(),
      manufacturedOn: line.manufacturedOn,
      expiresOn: line.expiresOn,
      productionCost: e.p.productionCost,
      quantities: { central: q },
      createdAt: o.now,
      createdBy: o.actor,
    });
    o.move(e, "central", q);
    o.ledger(e.p.id, q, null, "central", "intake", {
      lotId: id,
      lotCode: line.lotCode,
      note: p.note || "",
    });
  }
  return { id: o.id };
}
async function transfer(o, p) {
  const from = location("warehouse", p.from),
    to = location("warehouse", p.to);
  o.owns(from);
  check(from !== to, "Selecciona otro destino.");
  if (p.to !== "central")
    check(
      (await o.read("distWarehouses", p.to))?.active,
      "Almacén destino no disponible.",
    );
  const parts = await o.moveStock(p.line.productId, from, to, p.line.quantity);
  const e = o.stock.get(p.line.productId);
  o.ledger(p.line.productId, p.line.quantity, from, to, "transfer", {
    allocations: parts,
    note: p.note || "",
  });
  const record = {
    id: o.id,
    ...o.base(),
    fromWarehouseId: p.from,
    toWarehouseId: p.to,
    line: { ...p.line, productName: e.p.name, unitType: e.p.unitType },
    allocations: parts,
    note: p.note || "",
    responsibleName: o.member.displayName || o.actor,
  };
  o.put("distTransfers", o.id, record);
  return record;
}
async function dispatch(o, p, addition = false) {
  const current = addition
    ? await o.read("distDispatches", p.dispatch.id)
    : null;
  check(
    !addition || current?.status === "open",
    "El despacho ya está cerrado.",
  );
  const wh = addition
    ? current.warehouseId || "central"
    : p.warehouseId || "central";
  const from = location("warehouse", wh);
  o.owns(from);
  const routeId = addition ? current.routeId : p.routeId;
  const to = location("route", routeId);
  if (!addition) {
    const route = await o.read("distRoutes", routeId);
    check(route && route.active !== false, "La ruta no existe o está inactiva.");
    const seller = await o.read("members", p.distributorUid);
    check(
      seller?.active &&
        seller.role === "distributor" &&
        seller.routeId === routeId,
      "El distribuidor no corresponde a esta ruta.",
    );
    const existing = await o.query("distDispatches", "routeId", routeId);
    check(
      !existing.some((d) => d.status === "open"),
      "Esta ruta ya tiene un despacho abierto.",
    );
  }
  check(Array.isArray(p.lines) && p.lines.length, "Agrega productos.");
  const lines = [];
  for (const l of p.lines) {
    const stockEntry = await o.loadStock(l.productId, from);
    const product = stockEntry.p;
    const hasDispatchMerma = Object.prototype.hasOwnProperty.call(l, "dispatchMerma");
    const normalQuantity = hasDispatchMerma ? Number(l.normalQuantity) : Number(l.quantity);
    const dispatchMerma = hasDispatchMerma ? Number(l.dispatchMerma) : 0;
    check(
      Number.isFinite(normalQuantity) && normalQuantity > 0,
      "La cantidad debe ser mayor a cero.",
    );
    check(
      Number.isFinite(dispatchMerma) && dispatchMerma >= 0,
      "La merma de despacho no puede ser negativa.",
    );
    if (product.unitType !== "kg") {
      check(dispatchMerma === 0, "La merma adicional solo aplica a productos por kg.");
      check(Number.isInteger(normalQuantity), "Paquetes y unidades requieren cantidades enteras.");
    }
    const physicalQuantity = round(normalQuantity + dispatchMerma);
    if (l.physicalQuantity !== undefined) {
      check(
        round(Number(l.physicalQuantity)) === physicalQuantity,
        "El total físico no coincide con normal más merma.",
      );
    }
    const options = Array.isArray(l.allocationsRequested)
      ? { allocationsRequested: l.allocationsRequested }
      : l.lotId
        ? { lotId: l.lotId }
        : {};

    const allocations = await o.moveStock(l.productId, from, to, physicalQuantity, options);
    let mermaParts = [];
    if (dispatchMerma > 0) {
      const [, mParts] = splitAllocationsByAmounts(allocations, [normalQuantity, dispatchMerma]);
      mermaParts = mParts;
    }
    lines.push({
      productId: l.productId,
      productName: product.name,
      unitType: product.unitType,
      quantity: physicalQuantity,
      normalQuantity,
      dispatchMerma,
      physicalQuantity,
      allocations,
      dispatchMermaAllocations: mermaParts,
    });
    o.ledger(
      l.productId,
      physicalQuantity,
      from,
      to,
      addition ? "dispatch_addition" : "dispatch",
      {
        refId: current?.id || o.id,
        allocations,
        normalQuantity,
        dispatchMerma,
        physicalQuantity,
        note: hasDispatchMerma ? `Traslado físico a ruta; ${normalQuantity} normal + ${dispatchMerma} merma adicional.` : "",
      },
    );
  }
  if (addition) {
    current.additions = [
      ...(current.additions || []),
      {
        id: o.id,
        quantityByProduct: lines,
        createdAt: o.now,
        createdBy: o.actor,
        createdByName: o.member.displayName || o.actor,
        note: p.note || "",
      },
    ];
    o.put("distDispatches", current.id, current);
    return { id: current.id };
  }
  const d = {
    id: o.id,
    ...o.base(),
    routeId,
    routeName: p.routeName,
    distributorUid: p.distributorUid,
    distributorName: p.distributorName,
    warehouseId: wh,
    status: "open",
    lines,
    additions: [],
    observation: p.observation || "",
  };
  o.put("distDispatches", o.id, d);
  return d;
}
async function sale(o, p) {
  check(
    ["admin", "distributor"].includes(o.member.role),
    "No puedes registrar ventas.",
  );
  check(
    p.sourceLocation ===
      (o.member.role === "distributor" ? "route" : "centralWarehouse"),
    "Origen de venta no autorizado.",
  );
  await assertAdministrativeDayOpen(o);
  const isCourtesy = p.saleKind === "courtesy";
  if (isCourtesy) {
    check(
      typeof p.courtesyReason === "string" && p.courtesyReason.trim().length >= 4,
      "La venta de cortesía requiere un motivo de al menos 4 caracteres.",
    );
  }
  const loc =
    o.member.role === "distributor"
      ? location("route", o.member.routeId)
      : "central";
  if (o.member.role === "distributor") {
    const d = await o.read("distDispatches", p.dispatchId);
    check(
      d?.status === "open" &&
        !d.warehouseClosedBy &&
        d.distributorUid === o.actor &&
        d.routeId === o.member.routeId,
      "La ruta no está abierta.",
    );
    const c = await o.read("distClosures", `closure_${d.id}`);
    check(!c?.warehouseClosedBy, "Ya se recibió el retorno de la ruta.");
  }
  let activeOverride = null;
  if (p.customerId) {
    const c = await o.read("distCustomers", p.customerId);
    check(c?.active, "El cliente está inactivo.");
    check(c.identityNumber, "Completa el CI del cliente antes de vender.");
    if (!isCourtesy && Number(p.creditAmount) > 0) {
      const debts = await o.query("distReceivables", "customerId", p.customerId);
      const supportConfig = await o.read("supportConfig", "main");
      const creditBlockDays = Number.isInteger(supportConfig?.creditBlockDays)
        ? supportConfig.creditBlockDays
        : 7;
      const isOverdue = debts.some(
        (d) =>
          d.balance > 0 &&
          new Date(d.createdAt).getTime() + creditBlockDays * 86400000 <= Date.now(),
      );
      if (isOverdue) {
        const overrides = await o.query("distCreditOverrides", "customerId", p.customerId);
        activeOverride = overrides
          .filter((ov) => ov.active !== false && !ov.revokedAt && (!ov.validUntil || ov.validUntil >= o.now))
          .sort((a, b) => (b.validUntil || "").localeCompare(a.validUntil || ""))[0] || null;
        check(
          Boolean(activeOverride),
          `Venta a crédito bloqueada: el cliente tiene créditos pendientes de ${creditBlockDays} días o más. Requiere autorización de administración.`,
        );
      }
    }
    p.customerName = c.name;
    p.customerCode = c.identityNumber;
  }
  check(Array.isArray(p.lines) && p.lines.length, "Agrega productos.");
  const lines = [];
  for (const l of p.lines) {
    const product = await o.product(l.productId);
    if (!isCourtesy) {
      check(
        o.member.role === "admin" ||
          round(l.actualUnitPrice) === round(product.referencePrice),
        "El vendedor no puede modificar el precio. Revisa el precio vigente.",
      );
      check(
        Number.isFinite(l.actualUnitPrice) && l.actualUnitPrice >= 0,
        "Precio inválido.",
      );
    }
    const allocations = await o.take(l.productId, loc, l.quantity);
    const known = allocations.every((a) => a.productionCost !== null);
    const actualUnitPrice = isCourtesy ? 0 : round(l.actualUnitPrice);
    const subtotal = isCourtesy ? 0 : round(l.quantity * actualUnitPrice);
    const referenceUnitPriceSnapshot = round(product.referencePrice || 0);
    const referenceSubtotal = round(l.quantity * referenceUnitPriceSnapshot);
    const costTotal = known
      ? round(
          allocations.reduce((s, a) => s + a.quantity * a.productionCost, 0),
        )
      : null;
    lines.push({
      productId: l.productId,
      productNameSnapshot: product.name,
      unitType: product.unitType,
      unitLabel: product.saleUnitLabel || (product.unitType === 'kg' ? 'kg' : product.unitType === 'package' ? 'paquete' : 'unidad'),
      quantity: l.quantity,
      actualUnitPrice,
      subtotal,
      referenceUnitPriceSnapshot,
      referenceSubtotal,
      allocations,
      costTotal,
    });
    o.ledger(l.productId, l.quantity, loc, null, isCourtesy ? "courtesy" : "sale", {
      allocations,
      note: isCourtesy ? p.courtesyReason.trim() : undefined,
    });
  }
  const total = isCourtesy ? 0 : round(lines.reduce((n, l) => n + l.subtotal, 0));
  if (isCourtesy) {
    p.cashAmount = 0;
    p.qrAmount = 0;
    p.creditAmount = 0;
  } else {
    check(
      [p.cashAmount, p.qrAmount, p.creditAmount].every(
        (x) => Number.isFinite(x) && x >= 0,
      ) && Math.abs(total - p.cashAmount - p.qrAmount - p.creditAmount) < 0.01,
      "Los pagos no coinciden con el total.",
    );
    check(!p.creditAmount || p.customerId, "El crédito necesita un cliente.");
  }
  const courtesyReferenceValue = isCourtesy
    ? round(lines.reduce((s, l) => s + (l.referenceSubtotal || 0), 0))
    : undefined;
  const courtesyCostTotal = isCourtesy
    ? (lines.every((l) => l.costTotal !== null)
        ? round(lines.reduce((s, l) => s + (l.costTotal || 0), 0))
        : null)
    : undefined;

  const s = {
    id: o.id,
    ...o.base(),
    operationId: o.id,
    sourceLocation: p.sourceLocation,
    // Admin sales always belong to the central administrative till; stale UI
    // route selections must never leak into a route close.
    routeId: o.member.role === "distributor" ? o.member.routeId : "central",
    routeName: o.member.role === "distributor" ? (o.member.routeName || p.routeName || "Ruta") : "Administración",
    sellerUid: o.actor,
    sellerName: o.member.displayName || o.actor,
    // Solo una venta de distribuidor pertenece a un despacho. No confiar en
    // el dispatchId que pueda conservar la pantalla administrativa.
    dispatchId: o.member.role === "distributor" ? p.dispatchId || "" : "",
    customerId: p.customerId || "",
    customerName: p.customerName || "",
    customerCode: p.customerCode || "",
    lines,
    total,
    paymentKind: isCourtesy ? "cash" : p.paymentKind,
    cashAmount: isCourtesy ? 0 : p.cashAmount,
    qrAmount: isCourtesy ? 0 : p.qrAmount,
    creditAmount: isCourtesy ? 0 : p.creditAmount,
    note: p.note || "",
    saleKind: isCourtesy ? "courtesy" : "normal",
    ...(isCourtesy
      ? {
          courtesyReason: p.courtesyReason.trim(),
          courtesyReferenceValue,
          courtesyCostTotal,
        }
      : {}),
    ...(activeOverride
      ? {
          creditOverrideId: activeOverride.id || "",
          creditOverrideReason: activeOverride.reason || "",
          creditOverrideValidUntil: activeOverride.validUntil || "",
        }
      : {}),
  };
  o.put("distSales", o.id, s);
  if (!isCourtesy && p.creditAmount > 0)
    o.put("distReceivables", o.id, {
      id: o.id,
      ...o.base(),
      saleId: o.id,
      saleLines: lines,
      customerId: p.customerId,
      customerName: p.customerName,
      customerCode: p.customerCode,
      routeId: o.member.role === "distributor" ? o.member.routeId : "central",
      distributorUid: o.actor,
      distributorName: s.sellerName,
      originalAmount: p.creditAmount,
      paidAmount: 0,
      balance: p.creditAmount,
      status: "OPEN",
    });
  return s;
}
async function collection(o, p) {
  check(
    ["admin", "distributor"].includes(o.member.role),
    "No puedes cobrar esta deuda.",
  );
  await assertAdministrativeDayOpen(o);
  check(["cash", "qr", "mixed"].includes(p.method), "Método de pago inválido.");
  check(Number.isFinite(p.amount) && p.amount > 0, "Monto inválido.");
  const amount = round(p.amount);
  let cashAmount = 0;
  let qrAmount = 0;
  if (p.method === "cash") {
    cashAmount = amount;
  } else if (p.method === "qr") {
    qrAmount = amount;
  } else if (p.method === "mixed") {
    check(Number.isFinite(p.cashAmount) && p.cashAmount > 0, "Monto en efectivo inválido.");
    check(Number.isFinite(p.qrAmount) && p.qrAmount > 0, "Monto en QR inválido.");
    cashAmount = round(p.cashAmount);
    qrAmount = round(p.qrAmount);
    check(
      Math.abs(round(cashAmount + qrAmount) - amount) < 0.01,
      "La suma de efectivo y QR debe coincidir con el monto total cobrado.",
    );
  }

  let sortedDebts = [];
  let customerId = p.customerId || "";
  let customerName = p.customerName || "";
  let customerCode = p.customerCode || "";

  const specificReceivableId = p.receivable?.id || p.receivableId;
  if (specificReceivableId) {
    const r = await o.read("distReceivables", specificReceivableId);
    check(r && r.balance > 0, "La deuda no existe o ya está pagada.");
    check(amount <= r.balance, "El cobro supera el saldo de la deuda.");
    sortedDebts = [r];
    customerId = r.customerId || p.customerId || "";
    customerName = r.customerName || p.customerName || "";
    customerCode = r.customerCode || p.customerCode || "";
  } else if (p.customerId) {
    const cust = await o.read("distCustomers", p.customerId);
    check(cust, "Cliente no encontrado.");
    customerId = cust.id;
    customerName = cust.name;
    customerCode = cust.customerCode || cust.identityNumber || "";
    const rows = await o.query("distReceivables", "customerId", p.customerId);
    sortedDebts = rows
      .filter((r) => r.balance > 0)
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id));
    check(sortedDebts.length > 0, "El cliente no tiene deudas pendientes.");
  } else {
    check(false, "Debes indicar la deuda o el cliente a cobrar.");
  }

  const portfolioBalanceBefore = round(sortedDebts.reduce((sum, d) => sum + d.balance, 0));
  check(amount <= portfolioBalanceBefore, "El cobro supera el saldo pendiente.");

  let remainingToApply = amount;
  const allocations = [];

  for (const d of sortedDebts) {
    if (remainingToApply <= 0.0001) break;
    const applied = round(Math.min(remainingToApply, d.balance));
    const balanceBefore = d.balance;
    const balanceAfter = round(balanceBefore - applied);
    d.paidAmount = round((d.paidAmount || 0) + applied);
    d.balance = balanceAfter;
    d.status = balanceAfter === 0 ? "PAID" : "PARTIAL";
    o.put("distReceivables", d.id, d);
    allocations.push({
      receivableId: d.id,
      saleId: d.saleId || "",
      originRouteId: d.routeId || "",
      balanceBefore,
      appliedAmount: applied,
      balanceAfter,
    });
    remainingToApply = round(remainingToApply - applied);
  }

  const portfolioBalanceAfter = round(portfolioBalanceBefore - amount);
  const collectionRouteId = o.member.role === "distributor" ? o.member.routeId : "central";
  check(collectionRouteId, "El cobrador no tiene una ruta asignada.");

  const c = {
    id: o.id,
    ...o.base(),
    operationId: o.id,
    receivableId: sortedDebts.length === 1 ? sortedDebts[0].id : (allocations[0]?.receivableId || ""),
    allocations,
    portfolioBalanceBefore,
    portfolioBalanceAfter,
    customerId: customerId || "",
    customerName: customerName || "",
    customerCode: customerCode || "",
    saleLines: sortedDebts[0]?.saleLines || [],
    routeId: collectionRouteId || "",
    collectionOrigin: o.member.role === "distributor" ? "route" : "administration",
    originRouteId: sortedDebts[0]?.routeId || collectionRouteId || "",
    collectedByUid: o.actor || "",
    collectedByName: o.member.displayName || o.actor || "",
    amount,
    method: p.method,
    cashAmount,
    qrAmount,
    note: p.note || "",
  };
  o.put("distCollections", o.id, c);
  return c;
}

async function calculateAndSaveCreditStatus(o, customerId) {
  const c = await o.read("distCustomers", customerId);
  if (!c) return null;
  const rows = await o.query("distReceivables", "customerId", c.id);
  if (o.writes) {
    for (const [key, write] of o.writes.entries()) {
      if (key.startsWith("distReceivables/")) {
        const docId = key.slice("distReceivables/".length);
        const idx = rows.findIndex((r) => r.id === docId);
        if (write.data.customerId === c.id) {
          if (idx >= 0) rows[idx] = { ...rows[idx], ...write.data, id: docId };
          else rows.push({ ...write.data, id: docId });
        }
      }
    }
  }
  const openDebts = rows.filter((r) => r.balance > 0);
  const dates = openDebts.map((r) => r.createdAt).sort();
  const oldestPendingAt = dates[0] || null;

  const supportConfig = await o.read("supportConfig", "main");
  const creditBlockDays = Number.isInteger(supportConfig?.creditBlockDays)
    ? supportConfig.creditBlockDays
    : 7;
  const overdueDebts = openDebts.filter(
    (d) => new Date(d.createdAt).getTime() + creditBlockDays * 86400000 <= Date.now()
  );
  const overdueDates = overdueDebts.map((d) => d.createdAt).sort();
  const overduePendingAt = overdueDates[0] || null;

  const overrides = await o.query("distCreditOverrides", "customerId", c.id);
  if (o.writes) {
    for (const [key, write] of o.writes.entries()) {
      if (key.startsWith("distCreditOverrides/")) {
        const docId = key.slice("distCreditOverrides/".length);
        const idx = overrides.findIndex((ov) => ov.id === docId);
        if (write.data.customerId === c.id) {
          if (idx >= 0) overrides[idx] = { ...overrides[idx], ...write.data, id: docId };
          else overrides.push({ ...write.data, id: docId });
        }
      }
    }
  }
  const activeOverride = overrides
    .filter((ov) => ov.active !== false && !ov.revokedAt && (!ov.validUntil || ov.validUntil >= o.now))
    .sort((a, b) => (b.validUntil || "").localeCompare(a.validUntil || ""))[0] || null;

  const blocked = overdueDebts.length > 0 && !activeOverride;

  const status = {
    id: c.id,
    ...scopeMetadata(o.root),
    oldestPendingAt,
    overduePendingAt,
    creditBlockDays,
    blocked,
    activeOverrideId: activeOverride?.id || null,
    overrideValidUntil: activeOverride?.validUntil || null,
    overrideReason: activeOverride?.reason || null,
    checkedAt: o.now,
  };
  o.put("distCreditStatus", c.id, status);
  return status;
}

async function creditOverride(o, p) {
  o.admin();
  if (p.revoke || p.action === "revoke") {
    check(p.overrideId, "overrideId requerido.");
    const ov = await o.read("distCreditOverrides", p.overrideId);
    check(ov && ov.active !== false, "La excepción no está activa o ya fue revocada.");
    const revoked = {
      ...ov,
      active: false,
      revokedAt: o.now,
      revokedBy: o.actor,
      revokedByName: o.member.displayName || o.actor,
      revokeReason: p.reason?.trim() || "Revocado por administración.",
    };
    o.put("distCreditOverrides", ov.id, revoked);
    await calculateAndSaveCreditStatus(o, ov.customerId);
    return revoked;
  }

  check(p.customerId, "customerId requerido.");
  const cust = await o.read("distCustomers", p.customerId);
  check(cust && cust.active !== false, "Cliente inexistente o inactivo.");
  check(typeof p.reason === "string" && p.reason.trim().length >= 4, "El motivo de la excepción debe tener al menos 4 caracteres.");

  let validUntil = "";
  if (p.validUntil !== undefined && p.validUntil !== null && p.validUntil !== "") {
    check(typeof p.validUntil === "string", "Fecha de vigencia inválida.");
    const parsedTime = Date.parse(p.validUntil);
    check(Number.isFinite(parsedTime), "Fecha de vigencia inválida.");
    check(parsedTime > Date.now(), "La fecha de vigencia debe ser futura.");
    validUntil = new Date(parsedTime).toISOString();
  } else if (p.days !== undefined && p.days !== null) {
    check(Number.isInteger(p.days) && p.days >= 1 && p.days <= 30, "Los días de vigencia deben ser un entero entre 1 y 30.");
    validUntil = new Date(Date.now() + p.days * 86400000).toISOString();
  } else {
    validUntil = new Date(Date.now() + 7 * 86400000).toISOString();
  }
  check(validUntil && typeof validUntil === "string" && validUntil.length > 0, "Fecha de vigencia requerida.");

  const ov = {
    id: o.id,
    ...o.base(),
    customerId: cust.id,
    customerName: cust.name,
    reason: p.reason.trim(),
    validFrom: o.now,
    validUntil,
    createdByName: o.member.displayName || o.actor,
    active: true,
  };
  o.put("distCreditOverrides", o.id, ov);
  await calculateAndSaveCreditStatus(o, cust.id);
  return ov;
}

const handlers = {
  intake,
  transfer,
  dispatch,
  addition: (o, p) => dispatch(o, p, true),
  sale,
  collection,
  creditOverride,
};
async function processCommand(db, ref) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().status !== "queued") return;
    const command = snap.data();
    const root = ref.parent.parent;
    const membership = await tx.get(
      root.collection("members").doc(command.createdBy),
    );
    try {
      const tenantScoped = root.parent.id === 'tenants';
      check(membership.exists && (tenantScoped
        ? membership.data().status === 'active' && membership.data().tenantId === root.id
        : root.id === 'pachax' && membership.data().active === true), 'Acceso no autorizado.');
      check(handlers[command.type], "Operación no reconocida.");
      let member = membership.data();
      if (tenantScoped) {
        const [tenant, platform, maintenance] = await Promise.all([tx.get(root), tx.get(db.doc('platformOperators/' + command.createdBy)), tx.get(root.collection('maintenanceState').doc('reset'))]);
        const permission = ({ sale: 'sales.create', collection: 'credits.collect', creditStatus: 'credits.read', expense: 'sales.create', deleteExpense: 'settings.manage', intake: 'inventory.manage', transfer: 'inventory.manage', dispatch: 'dispatch.create', addition: 'dispatch.create', closure: 'route.close', adjustment: 'inventory.manage', claim: 'sales.create', updateLot: 'inventory.manage', reopen: 'route.close', deleteProduct: 'products.manage', creditOverride: 'settings.manage' })[command.type];
        check(tenant.data()?.billingEnforcement !== true || tenant.data()?.subscriptionStatus === 'active', 'La suscripción no está activa. Contacta a PACHAX.');
        check(tenant.data()?.businessType === 'route_distribution' && permission && hasPermission(tenant.data(), member, permission), 'Sin permiso para esta operación.');
        check(command.tenantId === root.id, 'Empresa de la operación inválida.');
        check(platform.data()?.active !== true && maintenance.data()?.active !== true, 'Operación no permitida durante soporte o mantenimiento.');
        check(member.branchIds?.includes(command.branchId || 'main'), 'Sucursal no autorizada.');
        member = legacyMember(member);
      }
      const o = new Operation(tx, root, command, member, ref.id);
      const result = await handlers[command.type](o, command.payload);
      o.flush();
      if (tenantScoped) audit(db, tx, { uid: command.createdBy, tenantId: root.id, actorType: 'tenant' }, 'distribution.' + command.type, ref.id, null, { operationId: ref.id });
      tx.update(ref, {
        status: "confirmed",
        result,
        processedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (
        !(error instanceof BusinessError) &&
        !(error instanceof TypeError) &&
        !(error instanceof RangeError)
      )
        throw error;
      tx.update(ref, {
        status: "rejected",
        error:
          error instanceof BusinessError
            ? error.message
            : "Datos incompletos o inválidos en la operación.",
        processedAt: new Date().toISOString(),
      });
    }
  });
}
module.exports = {
  processCommand,
  Operation,
  BusinessError,
  check,
  dayKey,
  round,
  handlers,
  isSaleForDispatch,
};
async function adjustment(o, p) {
  o.admin();
  const loc = location("warehouse", p.warehouseId || "central");
  check(p.note?.trim(), "El motivo del ajuste es obligatorio.");
  const e = await o.loadStock(p.line.productId, loc);
  const q = o.amount(p.line.quantity, e.p, true);
  check(
    q < 0,
    "Los aumentos deben registrarse como ingreso con lote y fechas.",
  );
  const parts = await o.take(p.line.productId, loc, -q, {
    allowExpired: true,
    lotId: p.line.lotId,
  });
  o.ledger(p.line.productId, -q, loc, null, "adjustment", {
    allocations: parts,
    note: p.note,
    lossCost: parts.every((a) => a.productionCost !== null)
      ? round(parts.reduce((s, a) => s + a.quantity * a.productionCost, 0))
      : null,
  });
  return { id: o.id };
}
async function expense(o, p) {
  check(
    o.member.role === "admin" ||
      (o.member.role === "distributor" && p.routeId === o.member.routeId),
    "No puedes registrar gastos en esta ruta.",
  );
  await assertAdministrativeDayOpen(o);
  check(
    Number.isFinite(p.amount) && p.amount > 0 && p.concept?.trim(),
    "Revisa concepto y monto.",
  );
  const e = {
    id: o.id,
    ...o.base(),
    operationId: o.id,
    concept: p.concept.trim(),
    amount: round(p.amount),
    routeId: o.member.role === "distributor" ? o.member.routeId : "central",
    routeName: o.member.role === "distributor" ? (o.member.routeName || p.routeName || "Ruta") : "Administración",
    expenseOrigin: o.member.role === "distributor" ? "route" : "administration",
    registeredByUid: o.actor,
    registeredByName: o.member.displayName || o.actor,
    note: p.note || "",
  };
  o.put("distExpenses", o.id, e);
  return e;
}

async function deleteExpense(o, p) {
  o.admin();
  const expense = await o.read("distExpenses", p.expenseId);
  check(expense && !expense.voided, "El gasto ya no está activo.");
  if (expense.expenseOrigin === "administration" && expense.dayKey) {
    const financialDay = await o.read("distAdministrativeDays", expense.dayKey);
    const legacyClose = await o.read("distClosures", `admin_close_${expense.dayKey}`);
    check(financialDay?.status !== "closed" && !legacyClose, "No se puede modificar un gasto administrativo de una jornada cerrada.");
  }
  o.put("distExpenses", expense.id, {
    ...expense,
    voided: true,
    voidedAt: o.now,
    voidedBy: o.actor,
    voidedByName: o.member.displayName || o.actor,
  });
  return { id: expense.id, voided: true };
}

async function deleteProduct(o, p) {
  o.admin();
  const product = await o.read("distProducts", p.productId);
  check(product && !product.deleted, "El producto ya no está disponible.");
  const balances = await o.query("distBalances", "productId", product.id);
  check(
    !balances.some((balance) => Number(balance.quantity || 0) > 0),
    "El producto todavía tiene existencias. Déjalo en cero antes de eliminarlo.",
  );
  const dispatches = await o.query("distDispatches", "status", "open");
  check(
    !dispatches.some((dispatch) =>
      [...(dispatch.lines || []), ...(dispatch.additions || []).flatMap((addition) => addition.quantityByProduct || [])]
        .some((line) => line.productId === product.id),
    ),
    "El producto forma parte de un despacho abierto. Cierra la ruta antes de eliminarlo.",
  );
  o.put("distProducts", product.id, {
    ...product,
    active: false,
    deleted: true,
    deletedAt: o.now,
    deletedBy: o.actor,
    deletedByName: o.member.displayName || o.actor,
  });
  return { id: product.id, deleted: true };
}
async function closure(o, p) {
  if (p.mode === "administrative") {
    check(o.member.role === "admin", "Solo Administración puede cerrar la caja administrativa.");
    check(validDate(p.dayKey) && p.dayKey === o.today, "Solo se puede cerrar la caja administrativa del día actual.");
    check(Number.isFinite(p.declaredCash) && p.declaredCash >= 0, "El efectivo declarado debe ser válido.");
    const id = `admin_close_${p.dayKey}`;
    const existing = await o.read("distClosures", id);
    check(!existing, "La caja administrativa de este día ya fue cerrada.");
    const financialDay = await o.read("distAdministrativeDays", p.dayKey);
    check(financialDay?.status !== "closed", "La caja administrativa de este día ya fue cerrada.");
    const [sales, collections, expenses, claims] = await Promise.all([
      o.query("distSales", "dayKey", p.dayKey),
      o.query("distCollections", "dayKey", p.dayKey),
      o.query("distExpenses", "dayKey", p.dayKey),
      o.query("distClaims", "dayKey", p.dayKey),
    ]);
    const adminSales = sales.filter(s => s.sourceLocation === "centralWarehouse" && !s.pendingConfirmation && s.saleKind !== "courtesy");
    const adminCollections = collections.filter(c => c.collectionOrigin === "administration" && !c.pendingConfirmation);
    const adminExpenses = expenses.filter(e => e.expenseOrigin === "administration" && !e.voided && !e.pendingConfirmation);
    const adminClaims = claims.filter(c => !c.pendingConfirmation);
    const cashSales = round(adminSales.reduce((sum, sale) => sum + (Number(sale.cashAmount) || 0), 0));
    const qrSales = round(adminSales.reduce((sum, sale) => sum + (Number(sale.qrAmount) || 0), 0));
    const creditSales = round(adminSales.reduce((sum, sale) => sum + (Number(sale.creditAmount) || 0), 0));
    const cashCollections = round(adminCollections.reduce((sum, row) => sum + (Number(row.cashAmount) || 0), 0));
    const qrCollections = round(adminCollections.reduce((sum, row) => sum + (Number(row.qrAmount) || 0), 0));
    const expensesTotal = round(adminExpenses.reduce((sum, row) => sum + row.amount, 0));
    const claimCashIn = round(adminClaims.reduce((sum, row) => sum + (Number(row.cashIn) || 0), 0));
    const claimCashOut = round(adminClaims.reduce((sum, row) => sum + (Number(row.cashOut) || 0), 0));
    const claimQrIn = round(adminClaims.reduce((sum, row) => sum + (Number(row.qrIn) || 0), 0));
    const claimQrOut = round(adminClaims.reduce((sum, row) => sum + (Number(row.qrOut) || 0), 0));
    const expectedCash = round(cashSales + cashCollections + claimCashIn - claimCashOut - expensesTotal);
    const close = {
      id, ...o.base(), closeType: "administrative", status: "closed", dayKey: p.dayKey,
      routeId: "central", routeName: "Administración", dispatchId: "", responsibleUid: o.actor,
      responsibleName: o.member.displayName || o.actor,
      distributorUid: "", distributorName: "Administración", products: [],
      salesCount: adminSales.length, collectionsCount: adminCollections.length, expensesCount: adminExpenses.length, claimsCount: adminClaims.length,
      cashSales, qrSales, creditSales, cashCollections, qrCollections, expensesTotal,
      claimCashIn, claimCashOut, claimQrIn, claimQrOut,
      creditGenerated: creditSales, cashExpenses: expensesTotal,
      totalSales: round(adminSales.reduce((sum, sale) => sum + sale.total, 0)),
      totalCollections: round(adminCollections.reduce((sum, row) => sum + row.amount, 0)),
      expectedCash, declaredCash: round(p.declaredCash), physicalCashDeclared: round(p.declaredCash), cashDifference: round(p.declaredCash - expectedCash),
      closedAt: o.now,
    };
    o.put("distClosures", id, close);
    o.put("distAdministrativeDays", p.dayKey, {
      ...(financialDay || {}),
      id: p.dayKey,
      ...o.base(),
      status: "closed",
      closedAt: o.now,
      closeId: id,
      closedBy: o.actor,
      lastOperationAt: o.now,
      lastOperationId: o.id,
    });
    return close;
  }
  if (p.mode === "declaration") {
    const d = await o.read("distDispatches", p.dispatchId);
    check(d?.status === "open", "La ruta ya no está abierta para declarar el retorno.");
    check(
      o.member.role === "distributor" && d.distributorUid === o.actor,
      "Solo el distribuidor asignado puede declarar el retorno de esta ruta.",
    );
    const id = `closure_${d.id}`;
    const previous = (await o.read("distClosures", id)) || {};
    check(
      !previous.returnDeclaredAt && !previous.warehouseClosedBy,
      "La devolución ya fue declarada o confirmada por almacén.",
    );

    const loadedMap = new Map();
    for (const line of d.lines || []) {
      const q = line.physicalQuantity ?? line.quantity;
      loadedMap.set(line.productId, round((loadedMap.get(line.productId) || 0) + q));
    }
    for (const add of d.additions || []) {
      for (const line of add.quantityByProduct || []) {
        const q = line.physicalQuantity ?? line.quantity;
        loadedMap.set(line.productId, round((loadedMap.get(line.productId) || 0) + q));
      }
    }

    const declaredReturns = {};
    const declaredReturnMermas = {};
    const declaredReturnNonSellables = {};
    const declaredReturnNonSellableReasons = {};
    const declaredBreakdown = {};

    let breakdownList = null;
    if (Array.isArray(p.breakdown)) {
      breakdownList = p.breakdown;
    } else if (Array.isArray(p.declaredBreakdown)) {
      breakdownList = p.declaredBreakdown;
    } else if (p.declaredBreakdown && typeof p.declaredBreakdown === "object") {
      breakdownList = Object.entries(p.declaredBreakdown).map(([productId, val]) => {
        if (typeof val === "number") {
          return { productId, normalReturn: val, recoverableMerma: 0, nonSellableReturn: 0, nonSellableReason: "" };
        }
        return { productId, ...val };
      });
    }

    if (breakdownList) {
      check(breakdownList.length === loadedMap.size, "Declara el retorno de todos los productos de la ruta.");
      for (const item of breakdownList) {
        check(item?.productId && loadedMap.has(item.productId), "Producto inválido en la declaración.");
        const product = await o.product(item.productId);
        const normal = Number(item.normalReturn ?? item.actualReturn ?? 0);
        const merma = Number(item.recoverableMerma ?? item.returnMerma ?? 0);
        const nonSellable = Number(item.nonSellableReturn ?? item.returnWaste ?? 0);
        const reason = String(item.nonSellableReason ?? item.returnWasteReason ?? "").trim();

        check(Number.isFinite(normal) && normal >= 0, "El retorno normal debe ser válido y no negativo.");
        check(Number.isFinite(merma) && merma >= 0, "La merma debe ser válida y no negativa.");
        check(Number.isFinite(nonSellable) && nonSellable >= 0, "El no apto debe ser válido y no negativo.");
        if (product.unitType !== "kg") {
          check(Number.isInteger(normal) && Number.isInteger(nonSellable) && merma === 0, "Paquetes y unidades requieren cantidades enteras sin merma.");
        }
        check(nonSellable === 0 || reason.length > 0, "Indica el motivo del producto no apto devuelto.");

        const totalPhysical = round(normal + merma + nonSellable);
        declaredReturns[item.productId] = normal;
        declaredReturnMermas[item.productId] = merma;
        declaredReturnNonSellables[item.productId] = nonSellable;
        if (reason) declaredReturnNonSellableReasons[item.productId] = reason;
        declaredBreakdown[item.productId] = {
          productId: item.productId,
          normalReturn: normal,
          recoverableMerma: merma,
          nonSellableReturn: nonSellable,
          nonSellableReason: reason,
          totalPhysicalReturn: totalPhysical,
        };
      }
    } else {
      const rawDeclared = p.declaredReturns;
      check(
        rawDeclared && typeof rawDeclared === "object" && !Array.isArray(rawDeclared),
        "Falta la declaración del retorno.",
      );
      check(
        Object.keys(rawDeclared).length === loadedMap.size &&
          [...loadedMap.keys()].every((pid) => Object.prototype.hasOwnProperty.call(rawDeclared, pid)),
        "Declara el retorno de todos los productos de la ruta.",
      );
      const rawMermas = p.declaredReturnMermas || {};
      const rawNonSellables = p.declaredReturnNonSellables || {};
      const rawReasons = p.declaredReturnNonSellableReasons || {};

      for (const pid of loadedMap.keys()) {
        const product = await o.product(pid);
        const normal = Number(rawDeclared[pid]);
        const merma = Number(rawMermas[pid] || 0);
        const nonSellable = Number(rawNonSellables[pid] || 0);
        const reason = String(rawReasons[pid] || "").trim();

        check(Number.isFinite(normal) && normal >= 0, "El retorno normal debe ser válido y no negativo.");
        check(Number.isFinite(merma) && merma >= 0, "La merma debe ser válida y no negativa.");
        check(Number.isFinite(nonSellable) && nonSellable >= 0, "El no apto debe ser válido y no negativo.");
        if (product.unitType !== "kg") {
          check(Number.isInteger(normal) && Number.isInteger(nonSellable) && merma === 0, "Paquetes y unidades requieren cantidades enteras sin merma.");
        }
        check(nonSellable === 0 || reason.length > 0, "Indica el motivo del producto no apto devuelto.");

        const totalPhysical = round(normal + merma + nonSellable);
        declaredReturns[pid] = normal;
        declaredReturnMermas[pid] = merma;
        declaredReturnNonSellables[pid] = nonSellable;
        if (reason) declaredReturnNonSellableReasons[pid] = reason;
        declaredBreakdown[pid] = {
          productId: pid,
          normalReturn: normal,
          recoverableMerma: merma,
          nonSellableReturn: nonSellable,
          nonSellableReason: reason,
          totalPhysicalReturn: totalPhysical,
        };
      }
    }

    const c = {
      ...previous,
      id,
      ...o.base(),
      dispatchId: d.id,
      warehouseId: d.warehouseId || "central",
      routeId: d.routeId,
      routeName: d.routeName,
      distributorUid: d.distributorUid,
      distributorName: d.distributorName,
      status: previous.status || "draft",
      declaredReturns,
      declaredReturnMermas,
      declaredReturnNonSellables,
      declaredReturnNonSellableReasons,
      declaredBreakdown,
      returnDeclaredBy: o.actor,
      returnDeclaredAt: o.now,
      dayKey: d.dayKey,
      ...(p.physicalCashDeclared !== undefined
        ? {
            physicalCashDeclared: round(Number(p.physicalCashDeclared)),
            cashDeclaredBy: o.actor,
            cashDeclaredAt: o.now,
          }
        : {}),
    };
    o.put("distClosures", id, c);
    return c;
  }

  const requested = p.closure || p;
  const d = await o.read("distDispatches", requested.dispatchId);
  check(d?.status === "open", "La ruta ya está cerrada.");
  const id = `closure_${d.id}`,
    previous = (await o.read("distClosures", id)) || {};
  const route = location("route", d.routeId),
    warehouse = location("warehouse", d.warehouseId || "central");
  const sales = (await o.query("distSales", "dispatchId", d.id))
    .filter((sale) => isSaleForDispatch(sale, d.routeId))
    .map((sale) => sale.effectiveSnapshot ? { ...sale, ...sale.effectiveSnapshot } : sale);
  if (p.mode === "warehouse") {
    o.owns(warehouse);
    check(!previous.warehouseClosedBy, "El retorno ya se confirmó.");
    check(previous.returnDeclaredAt, "El distribuidor debe declarar el retorno antes de la recepción de almacén.");
    const ids = [
      ...new Set(
        [
          ...d.lines,
          ...(d.additions || []).flatMap((a) => a.quantityByProduct),
        ].map((l) => l.productId),
      ),
    ];
    const rows = [];
    const warehouseBreakdown = {};
    const physicalEvidence = [];

    for (const pid of ids) {
      const e = await o.loadStock(pid, route);
      await o.loadStock(pid, warehouse);
      const expected = e.balances.get(route).quantity;
      const wb = requested.warehouseBreakdown;
      const returnList = Array.isArray(requested.products)
        ? requested.products
        : Array.isArray(wb)
          ? wb
          : (wb && typeof wb === "object" ? Object.values(wb) : []);
      const returnRow = returnList.find((r) => r.productId === pid) || (wb && typeof wb === "object" ? wb[pid] : null) || {};

      const normalReturn = round(Number(returnRow.normalReturn ?? returnRow.actualReturn ?? 0));
      const recoverableMerma = round(Number(returnRow.recoverableMerma ?? returnRow.returnMerma ?? 0));
      const nonSellableReturn = round(Number(returnRow.nonSellableReturn ?? returnRow.returnWaste ?? 0));
      const nonSellableReason = String(returnRow.nonSellableReason ?? returnRow.returnWasteReason ?? "").trim();

      check(Number.isFinite(normalReturn) && normalReturn >= 0, "Completa el retorno normal.");
      check(Number.isFinite(recoverableMerma) && recoverableMerma >= 0, "Merma inválida.");
      check(Number.isFinite(nonSellableReturn) && nonSellableReturn >= 0, "No apto inválido.");
      if (e.p.unitType !== "kg") {
        check(
          Number.isInteger(normalReturn) && Number.isInteger(nonSellableReturn) && recoverableMerma === 0,
          "Paquetes y unidades requieren cantidades enteras sin merma.",
        );
      }
      check(nonSellableReturn === 0 || nonSellableReason.length > 0, "Indica el motivo del producto no apto devuelto.");

      const warehousePhysical = round(normalReturn + recoverableMerma + nonSellableReturn);
      if (returnRow.physicalReturn !== undefined || returnRow.totalPhysicalReturn !== undefined) {
        const expectedTotal = round(Number(returnRow.physicalReturn ?? returnRow.totalPhysicalReturn));
        check(expectedTotal === warehousePhysical, "El total físico recibido no coincide con la suma de componentes.");
      }

      warehouseBreakdown[pid] = {
        productId: pid,
        normalReturn,
        recoverableMerma,
        nonSellableReturn,
        nonSellableReason,
        totalPhysicalReturn: warehousePhysical,
      };

      const normalApt = round(Math.min(normalReturn, expected));
      const recoverableFromRoute = round(Math.min(recoverableMerma, Math.max(0, expected - normalApt)));
      const wasteFromRoute = round(Math.min(nonSellableReturn, Math.max(0, expected - normalApt - recoverableFromRoute)));
      const shortage = round(Math.max(0, expected - warehousePhysical));
      const overage = round(Math.max(0, warehousePhysical - expected));

      const accountedRouteQuantity = round(normalApt + recoverableFromRoute + wasteFromRoute);
      const receivedParts =
        accountedRouteQuantity > 0
          ? await o.take(pid, route, accountedRouteQuantity, { allowExpired: true })
          : [];

      const [returnParts, recoverableMermaParts, wasteParts] = splitAllocationsByAmounts(
        receivedParts,
        [normalApt, recoverableFromRoute, wasteFromRoute],
      );

      for (const a of [...returnParts, ...recoverableMermaParts]) {
        const l = e.lots.find((x) => x.id === a.lotId);
        check(l, "No se encontró el lote del producto retornado.");
        l.quantities[warehouse] = round(
          (l.quantities[warehouse] || 0) + a.quantity,
        );
      }

      if (normalApt > 0) {
        o.move(e, warehouse, normalApt);
        const m = o.ledger(pid, normalApt, route, warehouse, "return", {
          allocations: returnParts,
          dispatchId: d.id,
        });
        for (const a of returnParts) {
          const l = e.lots.find((x) => x.id === a.lotId);
          physicalEvidence.push({
            movementId: m.id,
            type: "return",
            productId: pid,
            lotId: a.lotId,
            lotCode: a.lotCode || l?.lotCode || "",
            quantity: a.quantity,
            movementCreatedAt: m.createdAt,
            warehouseLocation: warehouse,
            warehouseQuantityAfter: round(l?.quantities?.[warehouse] || 0),
            routeQuantityAfter: round(l?.quantities?.[route] || 0),
          });
        }
      }
      if (recoverableFromRoute > 0) {
        o.move(e, warehouse, recoverableFromRoute);
        const m = o.ledger(pid, recoverableFromRoute, route, warehouse, "return_merma", {
          allocations: recoverableMermaParts,
          dispatchId: d.id,
          note: "Merma operativa recuperable; vuelve al stock vendible en sus lotes originales.",
        });
        for (const a of recoverableMermaParts) {
          const l = e.lots.find((x) => x.id === a.lotId);
          physicalEvidence.push({
            movementId: m.id,
            type: "return_merma",
            productId: pid,
            lotId: a.lotId,
            lotCode: a.lotCode || l?.lotCode || "",
            quantity: a.quantity,
            movementCreatedAt: m.createdAt,
            warehouseLocation: warehouse,
            warehouseQuantityAfter: round(l?.quantities?.[warehouse] || 0),
            routeQuantityAfter: round(l?.quantities?.[route] || 0),
          });
        }
      }

      let wasteLossCost = null;
      if (wasteFromRoute > 0) {
        const knownCost = wasteParts.every((a) => a.productionCost !== null);
        wasteLossCost = knownCost
          ? round(wasteParts.reduce((s, a) => s + a.quantity * a.productionCost, 0))
          : null;
        const m = o.ledger(pid, wasteFromRoute, route, null, "return_waste", {
          allocations: wasteParts,
          lossCost: wasteLossCost,
          reason: nonSellableReason,
          dispatchId: d.id,
        });
        for (const a of wasteParts) {
          physicalEvidence.push({
            movementId: m.id,
            type: "return_waste",
            productId: pid,
            lotId: a.lotId,
            lotCode: a.lotCode || "",
            quantity: a.quantity,
            movementCreatedAt: m.createdAt,
            routeLocation: route,
            routeQuantityAfter: 0,
          });
        }
      }

      let shortageLossCost = null;
      if (shortage > 0) {
        const loss = await o.take(pid, route, shortage, {
          allowExpired: true,
        });
        const knownCost = loss.every((a) => a.productionCost !== null);
        shortageLossCost = knownCost
          ? round(loss.reduce((s, a) => s + a.quantity * a.productionCost, 0))
          : null;
        const m = o.ledger(pid, shortage, route, null, "shortage", {
          allocations: loss,
          lossCost: shortageLossCost,
          dispatchId: d.id,
        });
        for (const a of loss) {
          physicalEvidence.push({
            movementId: m.id,
            type: "shortage",
            productId: pid,
            lotId: a.lotId,
            lotCode: a.lotCode || "",
            quantity: a.quantity,
            movementCreatedAt: m.createdAt,
            routeLocation: route,
            routeQuantityAfter: 0,
          });
        }
      }

      if (overage > 0) {
        const lotId = `${o.id}__surplus_${pid}`;
        e.lots.push({
          id: lotId,
          ...scopeMetadata(o.root),
          productId: pid,
          productName: e.p.name,
          unitType: e.p.unitType,
          lotCode: "SOBRANTE POR REVISAR",
          manufacturedOn: "",
          expiresOn: "",
          productionCost: null,
          quarantined: true,
          quantities: { [warehouse]: overage },
          createdAt: o.now,
          createdBy: o.actor,
        });
        o.move(e, warehouse, overage);
        const m = o.ledger(pid, overage, null, warehouse, "overage", {
          lotId,
          allocations: [],
          dispatchId: d.id,
          note: "Sobrante físico sin asignación de lote verificable; separado en cuarentena hasta revisar su origen.",
        });
        physicalEvidence.push({
          movementId: m.id,
          type: "overage",
          productId: pid,
          lotId,
          lotCode: "SOBRANTE POR REVISAR",
          quantity: overage,
          movementCreatedAt: m.createdAt,
          warehouseLocation: warehouse,
          warehouseQuantityAfter: overage,
          quarantined: true,
        });
      }

      check(e.balances.get(route).quantity === 0, `El balance de ruta de ${e.p.name} debe quedar exactamente en 0.`);

      const initialNormal = d.lines
        .filter((l) => l.productId === pid)
        .reduce((s, l) => s + (l.normalQuantity ?? l.quantity), 0);
      const initialMerma = d.lines
        .filter((l) => l.productId === pid)
        .reduce((s, l) => s + (l.dispatchMerma ?? 0), 0);
      const initialPhysical = round(initialNormal + initialMerma);

      const additionsNormal = (d.additions || [])
        .flatMap((a) => a.quantityByProduct)
        .filter((l) => l.productId === pid)
        .reduce((s, l) => s + (l.normalQuantity ?? l.quantity), 0);
      const additionsMerma = (d.additions || [])
        .flatMap((a) => a.quantityByProduct)
        .filter((l) => l.productId === pid)
        .reduce((s, l) => s + (l.dispatchMerma ?? 0), 0);
      const additionsPhysical = round(additionsNormal + additionsMerma);

      const totalLoadedPhysical = round(initialPhysical + additionsPhysical);
      const commercialSold = round(
        sales
          .filter((s) => s.saleKind !== "courtesy")
          .flatMap((s) => s.lines)
          .filter((l) => l.productId === pid)
          .reduce((s, l) => s + l.quantity, 0),
      );
      const courtesySold = round(
        sales
          .filter((s) => s.saleKind === "courtesy")
          .flatMap((s) => s.lines)
          .filter((l) => l.productId === pid)
          .reduce((s, l) => s + l.quantity, 0),
      );
      const sold = round(commercialSold + courtesySold);

      const declaredItem = previous.declaredBreakdown?.[pid] || {
        normalReturn: previous.declaredReturns?.[pid] ?? 0,
        recoverableMerma: previous.declaredReturnMermas?.[pid] ?? 0,
        nonSellableReturn: previous.declaredReturnNonSellables?.[pid] ?? 0,
        nonSellableReason: previous.declaredReturnNonSellableReasons?.[pid] ?? "",
        totalPhysicalReturn: round(
          (previous.declaredReturns?.[pid] ?? 0) +
            (previous.declaredReturnMermas?.[pid] ?? 0) +
            (previous.declaredReturnNonSellables?.[pid] ?? 0),
        ),
      };

      const declaredPhysical = declaredItem.totalPhysicalReturn;
      const declarationVariance = round(warehousePhysical - declaredPhysical);

      rows.push({
        productId: pid,
        productName: e.p.name,
        unitType: e.p.unitType,
        initialNormalDispatch: initialNormal,
        initialDispatchMerma: initialMerma,
        initialPhysicalDispatch: initialPhysical,
        additionsNormal,
        additionsMerma,
        additionsPhysical,
        totalLoadedPhysical,
        initialDispatch: initialPhysical,
        additions: additionsPhysical,
        totalLoaded: totalLoadedPhysical,
        sold,
        commercialSold,
        courtesySold,
        expectedReturn: expected,
        actualReturn: normalApt,
        returnMerma: recoverableFromRoute,
        returnWaste: nonSellableReturn,
        returnWasteReason: nonSellableReason,
        shortage,
        overage,
        variance: round(overage - shortage),
        declarationVariance,
        lossCost: wasteLossCost,
        declared: {
          normal: declaredItem.normalReturn,
          recoverableMerma: declaredItem.recoverableMerma,
          nonSellable: declaredItem.nonSellableReturn,
          nonSellableReason: declaredItem.nonSellableReason,
          totalPhysical: declaredPhysical,
        },
        warehouse: {
          normal: normalReturn,
          recoverableMerma,
          nonSellable: nonSellableReturn,
          nonSellableReason,
          totalPhysical: warehousePhysical,
        },
      });
    }
    const c = {
      ...previous,
      id,
      ...o.base(),
      dispatchId: d.id,
      warehouseId: d.warehouseId || "central",
      routeId: d.routeId,
      routeName: d.routeName,
      distributorUid: d.distributorUid,
      distributorName: d.distributorName,
      status: "warehouse_done",
      products: rows,
      warehouseBreakdown,
      physicalEvidence,
      warehouseClosedBy: o.actor,
      warehouseClosedAt: o.now,
    };
    o.put("distClosures", id, c);
    return c;
  }
  check(
    o.member.role === "admin" ||
      (o.member.role === "distributor" && d.distributorUid === o.actor),
    "No puedes cerrar esta ruta.",
  );
  check(
    previous.warehouseClosedBy,
    "Almacén debe confirmar el retorno antes del cierre.",
  );
  const from = d.createdAt;
  const collections = (
    await o.query("distCollections", "routeId", d.routeId)
  ).filter((x) => x.createdAt >= from);
  const expenses = (await o.query("distExpenses", "routeId", d.routeId)).filter(
    (x) => x.createdAt >= from && !x.voided,
  );
  const claims = (await o.query("distClaims", "routeId", d.routeId)).filter(
    (x) => x.createdAt >= from,
  );
  const sum = (list, key) => round(list.reduce((n, r) => n + (r[key] || 0), 0));
  const cashSales = sum(sales, "cashAmount"),
    cashCollections = round(
      collections.reduce(
        (n, c) => n + (c.method === "cash" ? (c.amount || 0) : (c.cashAmount || 0)),
        0,
      ),
    ),
    cashExpenses = sum(expenses, "amount"),
    claimCash = round(sum(claims, "cashIn") - sum(claims, "cashOut")),
    expectedCash = round(
      cashSales + cashCollections - cashExpenses + claimCash,
    );
  check(
    Number.isFinite(requested.physicalCashDeclared) &&
      requested.physicalCashDeclared >= 0,
    "Efectivo declarado inválido.",
  );
  const c = {
    ...previous,
    status: "closed",
    cashSales,
    qrSales: sum(sales, "qrAmount"),
    creditGenerated: sum(sales, "creditAmount"),
    cashCollections,
    qrCollections: round(
      collections.reduce(
        (n, c) => n + (c.method === "qr" ? (c.amount || 0) : (c.qrAmount || 0)),
        0,
      ),
    ),
    cashExpenses,
    claimCash,
    expectedCash,
    physicalCashDeclared: requested.physicalCashDeclared,
    cashDifference: round(requested.physicalCashDeclared - expectedCash),
    closedBy: o.actor,
    closedAt: o.now,
  };
  o.put("distClosures", id, c);
  o.put("distDispatches", d.id, {
    ...d,
    status: "closed",
    closedAt: o.now,
    closureId: id,
  });
  return c;
}
async function claim(o, p) {
  o.admin();
  await assertAdministrativeDayOpen(o);
  check(p.reason?.trim(), "Indica el motivo del cambio o devolución.");
  check(["exchange", "return"].includes(p.kind), "Tipo de reclamo inválido.");
  const s = await o.read("distSales", p.saleId);
  check(s, "No existe la venta original.");
  const orig = s.lines.filter((l) => l.productId === p.productId);
  check(orig.length, "El producto no pertenece a esta venta.");
  const product = await o.read("distProducts", p.productId);
  check(product, "Producto inexistente.");
  const q = o.amount(p.quantity, product);
  const past = await o.query("distClaims", "saleId", s.id);
  check(
    round(
      q +
        past
          .filter((c) => c.productId === p.productId)
          .reduce((n, c) => n + c.quantity, 0),
    ) <= round(orig.reduce((n, l) => n + l.quantity, 0)),
    "La cantidad supera lo vendido o ya fue devuelta.",
  );
  const originalUnit = orig[0].actualUnitPrice;
  check(
    orig.every((l) => l.actualUnitPrice === originalUnit),
    "Esta venta tiene precios distintos para el mismo producto; revisa el comprobante con Administración.",
  );
  const loc = location("warehouse", p.warehouseId || "central");
  if (p.warehouseId && p.warehouseId !== "central")
    check(
      (await o.read("distWarehouses", p.warehouseId))?.active,
      "Almacén no disponible.",
    );
  const e = await o.loadStock(p.productId, loc);
  const returnedValue = round(q * originalUnit);
  let replacement = null,
    replacementValue = 0,
    additionalCost = 0;
  if (p.kind === "exchange") {
    const rp = await o.product(p.replacementProductId);
    const rq = o.amount(p.replacementQuantity, rp);
    const parts = await o.take(rp.id, loc, rq);
    replacementValue = round(rq * rp.referencePrice);
    additionalCost = parts.every((a) => a.productionCost !== null)
      ? round(parts.reduce((n, a) => n + a.quantity * a.productionCost, 0))
      : null;
    replacement = {
      productId: rp.id,
      productName: rp.name,
      quantity: rq,
      unitType: rp.unitType,
      unitPrice: rp.referencePrice,
      total: replacementValue,
      allocations: parts,
    };
    o.ledger(rp.id, rq, loc, null, "exchange", { allocations: parts });
  }
  const delta = round(replacementValue - returnedValue);
  const debt = await o.read("distReceivables", s.id);
  const debtReduction = Math.min(debt?.balance || 0, Math.max(0, -delta));
  if (debtReduction > 0) {
    const balance = round(debt.balance - debtReduction);
    o.put("distReceivables", debt.id, {
      ...debt,
      creditedAmount: round((debt.creditedAmount || 0) + debtReduction),
      balance,
      status: balance <= 0 ? "PAID" : debt.paidAmount > 0 ? "PARTIAL" : "OPEN",
      returnedAmount: round((debt.returnedAmount || 0) + debtReduction),
    });
  }
  check(
    p.kind === "exchange" || ["cash", "qr"].includes(p.method),
    "Elige efectivo o QR para la devolución.",
  );
  const refund = round(Math.max(0, -delta) - debtReduction);
  const lotId = `${o.id}__damaged`;
  e.lots.push({
    id: lotId,
    ...scopeMetadata(o.root),
    productId: product.id,
    productName: product.name,
    unitType: product.unitType,
    lotCode: p.originalLotCode || "DEVOLUCIÓN DE CLIENTE",
    manufacturedOn: "",
    expiresOn: "",
    productionCost: null,
    quarantined: true,
    quantities: { [loc]: q },
    createdAt: o.now,
    createdBy: o.actor,
    reason: p.reason,
  });
  o.move(e, loc, q);
  o.ledger(product.id, q, null, loc, "customer_return", {
    lotId,
    quarantined: true,
    note: p.reason,
  });
  const c = {
    id: o.id,
    ...o.base(),
    kind: p.kind,
    saleId: s.id,
    customerId: s.customerId || "",
    customerName: s.customerName || "",
    routeId: s.routeId,
    productId: p.productId,
    productName: product.name,
    unitType: product.unitType,
    quantity: q,
    reason: p.reason,
    warehouseId: p.warehouseId || "central",
    returnedValue,
    replacement,
    revenueDelta: delta,
    additionalCost,
    debtReduction,
    cashIn: p.kind === "return" && p.method === "cash" ? Math.max(0, delta) : 0,
    cashOut: p.kind === "return" && p.method === "cash" ? refund : 0,
    qrIn: p.kind === "return" && p.method === "qr" ? Math.max(0, delta) : 0,
    qrOut: p.kind === "return" && p.method === "qr" ? refund : 0,
    method: p.kind === "return" ? p.method : "none",
    responsibleName: o.member.displayName || o.actor,
  };
  o.put("distClaims", o.id, c);
  return c;
}
Object.assign(handlers, { adjustment, expense, deleteExpense, deleteProduct, closure, claim });
async function updateLot(o, p) {
  o.admin();
  const lot = await o.read("distLots", p.lotId);
  check(lot, "No existe el lote.");
  check(
    p.lotCode?.trim() &&
      validDate(p.manufacturedOn) &&
      validDate(p.expiresOn) &&
      p.manufacturedOn <= p.expiresOn &&
      p.manufacturedOn <= o.today,
    "Revisa las fechas y el código del lote.",
  );
  check(
    Number.isFinite(p.productionCost) && p.productionCost >= 0,
    "Costo inválido.",
  );
  check(p.reason?.trim(), "Indica el motivo de la actualización.");
  const updated = {
    ...lot,
    lotCode: p.lotCode.trim(),
    manufacturedOn: p.manufacturedOn,
    expiresOn: p.expiresOn,
    productionCost: p.productionCost,
    legacy: false,
    updatedAt: o.now,
    updatedBy: o.actor,
  };
  o.put("distLots", lot.id, updated);
  o.put("distLotHistory", o.id, {
    id: o.id,
    ...o.base(),
    lotId: lot.id,
    previous: {
      lotCode: lot.lotCode,
      manufacturedOn: lot.manufacturedOn,
      expiresOn: lot.expiresOn,
      productionCost: lot.productionCost,
    },
    next: {
      lotCode: updated.lotCode,
      manufacturedOn: updated.manufacturedOn,
      expiresOn: updated.expiresOn,
      productionCost: updated.productionCost,
    },
    reason: p.reason,
  });
  return updated;
}
handlers.updateLot = updateLot;
Object.assign(handlers, {
  adjustment,
  expense,
  deleteExpense,
  deleteProduct,
  closure,
  claim,
});
async function refreshCreditStatus(db, root, customerId) {
  await db.runTransaction(async (tx) => {
    const [receivablesSnap, supportSnap, overridesSnap] = await Promise.all([
      tx.get(root.collection("distReceivables").where("customerId", "==", customerId)),
      tx.get(root.collection("supportConfig").doc("main")),
      tx.get(root.collection("distCreditOverrides").where("customerId", "==", customerId)),
    ]);
    const openDebts = receivablesSnap.docs.map((d) => d.data()).filter((r) => r.balance > 0);
    const dates = openDebts.map((r) => r.createdAt).sort();
    const oldestPendingAt = dates[0] || null;

    const creditBlockDays = Number.isInteger(supportSnap.data()?.creditBlockDays)
      ? supportSnap.data().creditBlockDays
      : 7;
    const overdueDebts = openDebts.filter(
      (d) => new Date(d.createdAt).getTime() + creditBlockDays * 86400000 <= Date.now()
    );
    const overdueDates = overdueDebts.map((d) => d.createdAt).sort();
    const overduePendingAt = overdueDates[0] || null;

    const now = new Date().toISOString();
    const overrides = overridesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const activeOverride = overrides
      .filter((ov) => ov.active !== false && !ov.revokedAt && (!ov.validUntil || ov.validUntil >= now))
      .sort((a, b) => (b.validUntil || "").localeCompare(a.validUntil || ""))[0] || null;

    const blocked = overdueDebts.length > 0 && !activeOverride;

    tx.set(
      root.collection("distCreditStatus").doc(customerId),
      {
        id: customerId,
        ...scopeMetadata(root),
        oldestPendingAt,
        overduePendingAt,
        creditBlockDays,
        blocked,
        activeOverrideId: activeOverride?.id || null,
        overrideValidUntil: activeOverride?.validUntil || null,
        overrideReason: activeOverride?.reason || null,
        checkedAt: now,
      },
      { merge: true },
    );
  });
}
module.exports.refreshCreditStatus = refreshCreditStatus;

handlers.reopen = async (o, p) => {
  o.admin();
  check(p.reason?.trim(), "La razón de la reapertura es obligatoria.");
  const reason = p.reason.trim();
  const c = await o.read("distClosures", p.closureId);
  check(c, "No se encontró el cierre a reabrir.");
  check(c.status !== "reopened", "El cierre ya fue reabierto.");
  check(c.status === "closed" || c.status === "warehouse_done", "Solo se puede reabrir un cierre finalizado.");
  const d = await o.read("distDispatches", c.dispatchId);
  check(d, "No se encontró el despacho asociado.");
  check(d.status === "closed" || d.status === "open", "El despacho no está cerrado.");
  const others = await o.query("distDispatches", "routeId", c.routeId);
  check(
    !others.some((x) => x.id !== d.id && x.status === "open"),
    "La ruta tiene otro despacho abierto.",
  );

  const route = location("route", d.routeId);
  const warehouse = location("warehouse", d.warehouseId || "central");
  const reversed = new Set(c.reversedStockMovementIds || []);

  const allMovements = await o.query("distStockMovements", "dispatchId", d.id);
  const closureMovements = allMovements.filter((m) =>
    ["return", "return_merma", "return_waste", "shortage", "overage"].includes(m.type) &&
    !reversed.has(m.id),
  );
  check(closureMovements.length > 0, "No hay movimientos físicos pendientes de revertir en este cierre.");

  const closureMovementIds = new Set(allMovements.map((m) => m.id));
  const evidenceList = c.physicalEvidence || [];

  for (const m of closureMovements) {
    const e = await o.loadStock(m.productId, warehouse);
    const productMovements = await o.query("distStockMovements", "productId", m.productId);

    if (m.type === "return" || m.type === "return_merma") {
      const allocations = m.allocations || [];
      for (const part of allocations) {
        const lotId = part.lotId;
        const lot = e.lots.find((item) => item.id === lotId);
        check(
          lot && round(lot.quantities?.[warehouse] || 0) >= part.quantity,
          "El inventario tuvo movimientos posteriores; requiere revisión manual.",
        );

        const ev = evidenceList.find((x) => x.movementId === m.id && x.lotId === lotId);
        if (ev && ev.warehouseQuantityAfter !== undefined) {
          check(
            round(lot.quantities?.[warehouse] || 0) === ev.warehouseQuantityAfter,
            "El inventario tuvo movimientos posteriores; requiere revisión manual.",
          );
        }

        // Buscar movimientos posteriores que afecten a este lote en este almacén
        const subsequentMov = productMovements.find((other) => {
          if (other.id === m.id || closureMovementIds.has(other.id)) return false;
          if (other.createdAt < m.createdAt) return false;
          const touchesLot = other.lotId === lotId || (other.allocations || []).some((a) => a.lotId === lotId);
          if (!touchesLot) return false;
          const touchesWh = other.fromLocation === warehouse || other.toLocation === warehouse ||
            (warehouse === "central" && (other.fromLocation === "central" || other.toLocation === "central"));
          return touchesWh;
        });

        check(!subsequentMov, "El inventario tuvo movimientos posteriores; requiere revisión manual.");
      }
    } else if (m.type === "overage") {
      const lotId = m.lotId;
      const lot = e.lots.find((item) => item.id === lotId && item.quarantined);
      check(
        lot && round(lot.quantities?.[warehouse] || 0) === m.quantity,
        "El inventario tuvo movimientos posteriores; requiere revisión manual.",
      );

      const subsequentMov = productMovements.find((other) => {
        if (other.id === m.id || closureMovementIds.has(other.id)) return false;
        if (other.createdAt < m.createdAt) return false;
        const touchesLot = other.lotId === lotId || (other.allocations || []).some((a) => a.lotId === lotId);
        return touchesLot;
      });

      check(!subsequentMov, "El inventario tuvo movimientos posteriores; requiere revisión manual.");
    }
  }

  const newlyReversedIds = [];
  for (const m of [...closureMovements].reverse()) {
    const e = await o.loadStock(m.productId, route);
    await o.loadStock(m.productId, warehouse);

    if (m.type === "return" || m.type === "return_merma") {
      for (const part of m.allocations || []) {
        const lot = e.lots.find((item) => item.id === part.lotId);
        lot.quantities[warehouse] = round(lot.quantities[warehouse] - part.quantity);
        lot.quantities[route] = round((lot.quantities[route] || 0) + part.quantity);
      }
      o.move(e, warehouse, -m.quantity);
      o.move(e, route, m.quantity);
    } else if (m.type === "return_waste" || m.type === "shortage") {
      for (const part of m.allocations || []) {
        const lot = e.lots.find((item) => item.id === part.lotId);
        check(lot, "No se puede reabrir: falta un lote original de la ruta.");
        lot.quantities[route] = round((lot.quantities[route] || 0) + part.quantity);
      }
      o.move(e, route, m.quantity);
    } else if (m.type === "overage") {
      const lot = e.lots.find((item) => item.id === m.lotId && item.quarantined);
      lot.quantities[warehouse] = round(lot.quantities[warehouse] - m.quantity);
      o.move(e, warehouse, -m.quantity);
    }

    o.put("distStockMovements", m.id, {
      ...m,
      reversedAt: o.now,
      reversedBy: o.actor,
      reversalOperationId: o.id,
      reversalReason: reason,
    });
    newlyReversedIds.push(m.id);
  }

  const reopenHistory = [
    ...(c.reopenHistory || []),
    {
      reopenedAt: o.now,
      reopenedBy: o.actor,
      reason,
      warehouseClosedBy: c.warehouseClosedBy || "",
      warehouseClosedAt: c.warehouseClosedAt || "",
      products: c.products || [],
    },
  ];

  o.put("distClosures", c.id, {
    ...c,
    status: "reopened",
    warehouseClosedBy: "",
    warehouseClosedAt: "",
    warehouseReopenedAt: o.now,
    reopenedBy: o.actor,
    reopenedAt: o.now,
    reopenHistory,
    reversedStockMovementIds: [...reversed, ...newlyReversedIds],
  });

  o.put("distDispatches", d.id, {
    ...d,
    status: "open",
    closedAt: "",
    closureId: "",
  });

  return { id: c.id };
};

handlers.creditStatus = async (o, p) => {
  check(["admin", "distributor"].includes(o.member.role), "Sin permiso.");
  check(p.customerId, "customerId requerido.");
  const status = await calculateAndSaveCreditStatus(o, p.customerId);
  check(status, "Cliente inexistente.");
  return status;
};
