import fs from 'node:fs'
import ts from 'typescript'
fs.mkdirSync('functions/generated', { recursive: true })
for (const name of ['platform', 'templates', 'sales', 'finance']) {
  const source = fs.readFileSync(`src/core/${name}.ts`, 'utf8')
  const result = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, rewriteRelativeImportExtensions: true,
  }, fileName: `${name}.ts` })
  fs.writeFileSync(`functions/generated/${name}.js`, result.outputText)
}
