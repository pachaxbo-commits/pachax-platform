import fs from 'node:fs'
import path from 'node:path'
// Preparación local únicamente. No crea recursos ni publica reglas o funciones.
const file=process.argv[2]
if (!file) throw new Error('Uso: node scripts/configure-firebase.mjs ruta/config-web.json')
const config=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'))
const keys={apiKey:'API_KEY',authDomain:'AUTH_DOMAIN',projectId:'PROJECT_ID',storageBucket:'STORAGE_BUCKET',messagingSenderId:'MESSAGING_SENDER_ID',appId:'APP_ID'}
for(const key of Object.keys(keys)) if(typeof config[key]!=='string'||!config[key].trim()||/[\r\n]/.test(config[key])) throw new Error(`Falta o no es válido: ${key}`)
if(config.projectId.startsWith('demo-')||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId)) throw new Error('Usa el ID real del nuevo proyecto Firebase.')
if(!config.authDomain.startsWith(config.projectId+'.')||!config.storageBucket.startsWith(config.projectId+'.')) throw new Error('El dominio y el almacenamiento deben pertenecer al proyecto nuevo. Revisa la configuración web.')
fs.writeFileSync('.env.local',Object.entries(keys).map(([key,name])=>`VITE_FIREBASE_${name}=${JSON.stringify(config[key])}`).join('\n')+'\nVITE_USE_FIREBASE_EMULATOR=false\n')
fs.writeFileSync('.firebaserc',JSON.stringify({projects:{default:config.projectId}},null,2)+'\n')
console.log('Configuración local guardada. No se realizó ningún despliegue. Siguiente paso: revisar los requisitos en docs/CONFIGURACION.md.')
