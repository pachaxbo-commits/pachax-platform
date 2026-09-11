const assert=require('node:assert/strict')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
;(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try {
  for(const email of ['admin@example.test','almacen@example.test','distribuidor.a@example.test','distribuidor.b@example.test','soporte@example.test']){
   const page=await browser.newPage({viewport:{width:390,height:844}})
   const failures=[]
   page.on('pageerror',e=>failures.push(e.message))
   await page.goto('http://127.0.0.1:5190')
   await page.locator('input[type=email]').fill(email)
   await page.locator('input[type=password]').fill('demo1234')
   await page.getByRole('button',{name:'Iniciar Sesión',exact:true}).click()
   await page.locator('.distribution-header').waitFor()
   await page.waitForTimeout(1200)
   const text=await page.locator('body').innerText()
   assert(text.includes('PACHAX'),`${email}: identidad incorrecta`)
   assert(!/insufficient permissions|permission.denied/i.test(text),`${email}: permiso rechazado`)
   assert.equal(failures.length,0,failures.join('\n'))
   console.log(`PASS acceso ${email}`)
   await page.close()
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
