const PROFILES = {
  food: ['Granos', 'Enlatados', 'Congelados', 'Otros'],
  beverages: ['Agua', 'Gaseosas', 'Jugos', 'Otros'],
  cleaning: ['Detergentes', 'Desinfectantes', 'Accesorios', 'Otros'],
  hardware: ['Herramientas', 'Fijaciones', 'Materiales', 'Otros'],
  pharmacy: ['Cuidado personal', 'Botiquín', 'Otros'],
  pets: ['Alimento', 'Higiene', 'Accesorios', 'Otros'],
  stationery: ['Escritura', 'Papel', 'Oficina', 'Otros'],
  spare_parts: ['Motor', 'Eléctrico', 'Accesorios', 'Otros'],
  mixed: ['General', 'Otros'],
};

function catalogForTenant(tenantId, industryProfile, updatedAt) {
  const categories = PROFILES[industryProfile];
  if (!categories) throw new Error('Rubro de distribución inválido.');
  return {
    id: 'catalog', tenantId, industryProfile, updatedAt,
    categories: categories.map(name => ({
      id: `cat-${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}`,
      name,
      active: true,
    })),
  };
}

function distributionProfile(businessType, value) {
  if (businessType !== 'route_distribution') {
    if (value !== undefined) throw new Error('El rubro solo se configura para la plantilla de Distribución.');
    return null;
  }
  const profile = value === undefined ? 'mixed' : value;
  if (typeof profile !== 'string' || !Object.hasOwn(PROFILES, profile)) throw new Error('Rubro de distribución inválido.');
  return profile;
}

module.exports = { PROFILES, catalogForTenant, distributionProfile };
