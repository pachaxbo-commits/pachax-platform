// Inicializa una empresa vacía después de crear manualmente el usuario en Auth.
// Requiere credenciales locales autorizadas para el NUEVO proyecto, fuera de Git.
const fs=require('node:fs')
const {createRequire}=require('node:module')
const req=createRequire(require('node:path').resolve('functions/package.json'))
const {initializeApp,applicationDefault}=req('firebase-admin/app')
const {getAuth}=req('firebase-admin/auth')
const {getFirestore}=req('firebase-admin/firestore')
;(async()=>{
 const [projectId,uid]=process.argv.slice(2)
 const configured=JSON.parse(fs.readFileSync('.firebaserc','utf8')).projects?.default
 if(!projectId||!uid||projectId!==configured||projectId.startsWith('demo-'))throw Error('Uso: node scripts/bootstrap-admin.cjs ID_NUEVO_PROYECTO UID_AUTH. El ID debe coincidir con .firebaserc.')
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('No mezclar inicialización real con variables de emulador.')
 initializeApp({projectId,credential:applicationDefault()})
 const user=await getAuth().getUser(uid)
 if(!user.email||user.disabled)throw Error('El usuario debe estar activo y tener correo.')
 const db=getFirestore(),root=db.doc('restaurants/pachax'),member=root.collection('members').doc(uid),mapping=db.doc(`users/${uid}`)
 const now=new Date().toISOString()
 await db.runTransaction(async transaction=>{
  const docs=await transaction.getAll(root,member,mapping)
  if(docs.some(doc=>doc.exists))throw Error('Ya existe configuración. Se cancela para no sobrescribir datos.')
  transaction.create(root,{id:'pachax',name:'PACHAX',slug:'pachax',ownerUid:uid,businessType:'mobile_distribution',currencyCode:'BOB',currencySymbol:'Bs',plan:'pro',createdAt:now,branding:{name:'PACHAX',primaryColor:'#C1121F',accentColor:'#F2B705',surfaceColor:'#FAF7F2',receiptHeader:'PACHAX',receiptFooter:'Gracias por su preferencia'}})
  transaction.create(member,{uid,email:user.email,displayName:user.displayName||'Administración',role:'admin',active:true,warehouseId:'central',routeId:'',createdAt:now})
  transaction.create(mapping,{uid,email:user.email,displayName:user.displayName||'Administración',defaultRestaurantId:'pachax',createdAt:now})
 })
 console.log('Empresa vacía y administrador inicializados. No se crearon productos, ventas ni datos demo.')
})().catch(error=>{console.error(error.message);process.exitCode=1})
