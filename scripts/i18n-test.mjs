import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(path.join(root, 'client/client.js'), 'utf8')
const dictStart = source.indexOf('var DICT = ')
const dictEnd = source.indexOf('\n    var currentLang', dictStart)
assert.ok(dictStart >= 0 && dictEnd > dictStart, 'DICT markers exist')
const dictLiteral = source.slice(dictStart + 'var DICT = '.length, dictEnd).trim()
const helperStart = source.indexOf('    var currentLang = ')
const helperEnd = source.indexOf('\n    function issueText', helperStart)
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'locale helper markers exist')
const runtime = Function(`"use strict";
  const DICT = ${dictLiteral};
  ${source.slice(helperStart, helperEnd)}
  return {
    dict: DICT,
    normalizeLocale,
    t,
    setLocale(id) { currentLang = normalizeLocale(id) },
  }
`)()
const dict = runtime.dict
const languages = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']
assert.deepEqual(Object.keys(dict), languages, 'exactly the eight DSH languages are bundled')

const reference = Object.keys(dict.en).sort()
const placeholders = (value) => (value.match(/\{\{[^{}]+\}\}|\{[^{}]+\}/g) || []).sort()
for (const lang of languages) {
  assert.deepEqual(Object.keys(dict[lang]).sort(), reference, `${lang}: key set matches en`)
  for (const key of reference) {
    const value = dict[lang][key]
    assert.equal(typeof value, 'string', `${lang}:${key} is a string`)
    assert.ok(value.trim(), `${lang}:${key} is not empty`)
    assert.deepEqual(placeholders(value), placeholders(dict.en[key]), `${lang}:${key} placeholders match`)
  }
}

for (const [input, expected] of Object.entries({
  'zh-CN': 'zh', 'zh-Hans': 'zh', 'en-US': 'en', 'ja-JP': 'ja',
  'es-MX': 'es', 'fr-CA': 'fr', 'DE-de': 'de', 'ru-RU': 'ru', 'pt-BR': 'pt',
  'it-IT': 'en', unknown: 'en',
})) assert.equal(runtime.normalizeLocale(input), expected, `normalize ${input}`)
assert.equal(runtime.normalizeLocale(''), 'zh', 'empty locale follows the default')

for (const lang of languages) {
  runtime.setLocale(lang)
  assert.equal(runtime.t('nav'), dict[lang].nav, `${lang}: active dictionary is used`)
  const refresh = runtime.t('refresh.success', { scanned: 3, count: 2 })
  assert.ok(refresh.includes('3') && refresh.includes('2'), `${lang}: refresh variables are interpolated`)
  assert.ok(!refresh.includes('{count}') && !refresh.includes('{scanned}'), `${lang}: refresh placeholders are consumed`)
  assert.ok(runtime.t('confirm.remove', { dir: '/tmp/skill' }).includes('/tmp/skill'), `${lang}: path variable is interpolated`)
}

const originalFr = dict.fr.nav
const originalEn = dict.en.nav
delete dict.fr.nav
delete dict.en.nav
runtime.setLocale('fr')
assert.equal(runtime.t('nav'), dict.zh.nav, 'missing active and English keys fall back to Chinese')
dict.fr.nav = originalFr
dict.en.nav = originalEn

const body = source.slice(0, dictStart) + source.slice(dictEnd)
assert.ok(!/\bb\(\s*['"]/.test(body), 'legacy bilingual b() calls are removed')
for (const match of body.matchAll(/\bt\(\s*'([^']+)'\s*[,)]/g)) {
  assert.ok(reference.includes(match[1]), `static translation key exists: ${match[1]}`)
}
for (const lang of languages) {
  const meta = JSON.parse(readFileSync(path.join(root, `locale/${lang}.json`), 'utf8'))
  assert.ok(meta.meta && meta.meta.title && meta.meta.description, `${lang}: plugin metadata is localized`)
}
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.ok(manifest.exports['./locale/*.json'] && manifest.files.includes('locale'), 'locale files are exported and packaged')
console.log(`i18n tests: ${languages.length} languages × ${reference.length} keys passed`)
