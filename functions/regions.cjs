// New tenant and Platform workloads are colocated with Firestore in Santiago.
// Historical restaurants/pachax entrypoints remain explicitly in us-central1.
const PACHAX_FUNCTIONS_REGION = 'southamerica-west1';
const LEGACY_FUNCTIONS_REGION = 'us-central1';

module.exports = { PACHAX_FUNCTIONS_REGION, LEGACY_FUNCTIONS_REGION };
