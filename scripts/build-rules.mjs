import fs from 'node:fs'
// Preserve the original namespace during transition; profile writes are now exclusively server-side.
let legacy = fs.readFileSync('firebase/legacy.rules','utf8')
const start = legacy.indexOf('    match /users/{uid} {')
const end = legacy.indexOf('    match /restaurants/{restaurantId}/members/{uid}', start)
legacy = legacy.slice(0,start) + `    match /users/{uid} {
      allow get: if request.auth != null && request.auth.uid == uid;
      allow list, write: if false;
    }
\n` + legacy.slice(end)
const body = ['tenant-core.rules','tenant-distribution.rules'].map(file => fs.readFileSync(`firebase/${file}`,'utf8')).join('\n')
fs.writeFileSync('firebase/firestore.rules', legacy.slice(0,legacy.lastIndexOf('  }')) + body + '\n  }\n}\n')
