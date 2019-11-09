const fs = require('fs')
const path = require('path')

function removeHtmlTag (content) {
  content = content.replace(/(?:<\/?[a-z][a-z1-6]{0,9}>|<[a-z][a-z1-6]{0,9} .+?>)/gi, '')
  return content.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
}

function writeHtmlFile (filePath, htmlContent, pythonVersion) {
  const startIndex = htmlContent.indexOf('<div class="body" role="main">')
  if (startIndex === -1) throw new Error('😱  未匹配到内容开头 --- ' + filePath)
  const endIndex = htmlContent.search(/\s*<\/div>\s*<\/div>\s*<div class="sphinxsidebar"/)
  if (endIndex === -1) throw new Error('😱  未匹配到内容结尾 --- ' + filePath)
  let docContent = htmlContent.substring(startIndex, endIndex)
  docContent = docContent.replace(/<a[^>\n]+?>¶<\/a>/g, '')
  docContent = docContent.replace(/<h(\d)>\s*\d{1,2}\.(?:\d{1,2}\.)?(?:\d{1,2}\.)?\s*?(.*?)<\/h\1>/g, '<h$1>$2</h$1>')
  docContent = docContent.replace(/href="(\.\.)(\/(?!library\/)[^"\n]+?)"/g, 'href="https://docs.python.org/zh-cn/' + pythonVersion + '$2"')
  fs.writeFileSync(filePath, `
      <!DOCTYPE html><html lang="zh_CN">
      <head>
        <meta charset="UTF-8">
        <title></title>
        <link rel="stylesheet" href="../pydoc.css" type="text/css" />
      </head>
      <body>${docContent}</body>
      </html>`)
}

// 语言参考索引
function getPythonReferenceIndexes (pythoneVersionDir, indexes) {
  const pythonVersion = pythoneVersionDir.match(/python-(\d\.\d)/)[1]
  const pubPath = path.join(__dirname, 'public', 'python-' + pythonVersion)
  const indexHtmlContent = fs.readFileSync(path.join(__dirname, pythoneVersionDir, 'reference', 'index.html'), { encoding: 'utf-8' })
  const matchs = indexHtmlContent.match(/<li class="toctree-l\d">\s*<a class="reference internal" href="[^"\n]+?">[\s\S]+?<\/a>/g)
  if (!matchs) throw new Error('😱  语言参考未匹配')
  let parentString = ''
  matchs.forEach(x => {
    const rowMatches = x.match(/<li class="toctree-l(\d)">\s*<a class="reference internal" href="([^"\n]+?)">([\s\S]+?)<\/a>/)
    if (rowMatches[1] === '1') {
      parentString = rowMatches[3].replace(/\d{1,2}\.(?:\d{1,2}\.)?/, '').trim()
      parentString = removeHtmlTag(parentString)
      const htmlContent = fs.readFileSync(path.join(__dirname, pythoneVersionDir, 'reference', rowMatches[2].trim()), { encoding: 'utf-8' })
      writeHtmlFile(path.join(pubPath, 'reference', rowMatches[2].trim()), htmlContent, pythonVersion)
      return
    }
    let key = rowMatches[3].replace(/\d{1,2}\.(?:\d{1,2}\.)?/, '').trim()
    key = removeHtmlTag(key)
    indexes.push({ t: key, p: 'reference/' + rowMatches[2].trim(), d: parentString })
  })
}

// Python 标准库索引
function getPythonLibraryIndexes (pythoneVersionDir, indexes) {
  const pythonVersion = pythoneVersionDir.match(/python-(\d\.\d)/)[1]
  const pubPath = path.join(__dirname, 'public', 'python-' + pythonVersion)
  const libraryDir = path.join(__dirname, pythoneVersionDir, 'library')
  const files = fs.readdirSync(libraryDir)
  files.forEach(f => {
    if (!f.endsWith('.html')) return
    let isUse = false
    const htmlContent = fs.readFileSync(path.join(libraryDir, f), { encoding: 'utf-8' })
    if (/<h1>(?:\d{1,2}\.\d{1,2}\. )?<a[^>\n]+?><code[^>\n]+?><span class="pre">(.+?)<\/span><\/code><\/a>\s*?(?:---|—)(.+?)<a class="headerlink".+?<\/h1>/.test(htmlContent)) {
      const t = removeHtmlTag(RegExp.$1.trim())
      const d = removeHtmlTag(RegExp.$2.trim())
      indexes.push({ t, p: 'library/' + f, d })
      isUse = true
    }
    const dlMatchs = htmlContent.match(/<dl class="(?:class|function|method|data|attribute)">\s*?<dt id="[^"\n]+?">[\s\S]+?<dd><p>[\s\S]+?<\/p>/g)
    if (dlMatchs) {
      dlMatchs.forEach(dl => {
        const maches = dl.match(/<dl class="(?:class|function|method|data|attribute)">\s*?<dt id="([^"\n]+?)">([\s\S]+?)<dd><p>([\s\S]+?)<\/p>/)
        const id = maches[1].trim()
        const checkNextContent = maches[2]
        const d = removeHtmlTag(maches[3]).replace(/\s+/g, ' ').trim()
        if (checkNextContent.includes('<dt id="')) {
          checkNextContent.match(/<dt id="[^"\n]+?">/g).forEach(nx => {
            const nid = nx.match(/<dt id="([^"\n]+?)">/)[1]
            indexes.push({ t: nid, p: 'library/' + f + '#' + nid, d })
          })
        }
        indexes.push({ t: id, p: 'library/' + f + '#' + id, d })
      })
      isUse = true
    }
    // 存在可能重复的ID  python文档的方式是用 target 处理
    const targetMatchs = htmlContent.match(/<span class="target" id="[^"\n]+?"><\/span>\s*?<dl class="(?:class|function|method|data|attribute)">\s*?<dt>[\s\S]+?<dd><p>[\s\S]+?<\/p>/g)
    if (targetMatchs) {
      targetMatchs.forEach(tt => {
        const maches = tt.match(/<span class="target" id="([^"\n]+?)"><\/span>\s*?<dl class="(?:class|function|method|data|attribute)">\s*?<dt>[\s\S]+?<dd><p>([\s\S]+?)<\/p>/)
        let id = maches[1].trim()
        let kid = id
        if (id.includes('-')) {
          const lcheck = id.substr(0, id.indexOf('-'))
          if (lcheck !== 'func') return
          kid = id.substr(id.indexOf('-') + 1)
        }
        const d = removeHtmlTag(maches[2]).replace(/\s+/g, ' ').trim()
        indexes.push({ t: kid, p: 'library/' + f + '#' + id, d })
      })
      isUse = true
    }
    if (isUse) {
      writeHtmlFile(path.join(pubPath, 'library', f), htmlContent, pythonVersion)
    }
  })
  fs.writeFileSync(path.join(pubPath, 'indexes.json'), JSON.stringify(indexes))
}

function main () {
  var args = process.argv.slice(2)
  const indexes = []
  const pythoneVersionDir = args[0]
  if (!/python-(\d\.\d)/.test(pythoneVersionDir)) throw new Error('文件夹错误')
  const pythonVersion = RegExp.$1
  if (!fs.existsSync(path.join(__dirname, pythoneVersionDir))) throw new Error(pythoneVersionDir + '文件夹不存在')
  const pubPath = path.join(__dirname, 'public', 'python-' + pythonVersion)
  if (!fs.existsSync(pubPath)) {
    fs.mkdirSync(pubPath)
    fs.mkdirSync(path.join(pubPath, 'reference'))
    fs.mkdirSync(path.join(pubPath, 'library'))
    fs.mkdirSync(path.join(pubPath, '_images'))
    fs.copyFileSync(path.join(__dirname, 'pydoc.css'), path.join(pubPath, 'pydoc.css'))
    fs.copyFileSync(path.join(__dirname, 'README.md'), path.join(pubPath, 'README.md'))
    fs.copyFileSync(path.join(__dirname, 'logo.png'), path.join(pubPath, 'logo.png'))
    fs.copyFileSync(path.join(__dirname, 'preload.js'), path.join(pubPath, 'preload.js'))
    const _imagesDir = path.join(__dirname, pythoneVersionDir, '_images')
    const images = fs.readdirSync(_imagesDir)
    images.forEach(fimg => {
      fs.copyFileSync(path.join(_imagesDir, fimg), path.join(pubPath, '_images', fimg))
    })
    let pluginJsonContent = fs.readFileSync(path.join(__dirname, 'plugin.json'), { encoding: 'utf-8' })
    pluginJsonContent = pluginJsonContent.replace(/<version>/g, pythonVersion)
    fs.writeFileSync(path.join(pubPath, 'plugin.json'), pluginJsonContent)
  }
  getPythonReferenceIndexes(pythoneVersionDir, indexes)
  getPythonLibraryIndexes(pythoneVersionDir, indexes)
}

main()
