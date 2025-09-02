import fetch from 'node-fetch'
import dotenv from 'dotenv'
dotenv.config()

console.log('🚀 Checking Netlify Deployment Status...\n')

// Check if the site is deployed
async function checkDeployment() {
  try {
    console.log('Checking main site deployment...')
    const response = await fetch('https://carmara-crm.netlify.app/')
    console.log('Site status:', response.status)
    
    if (response.ok) {
      console.log('✅ Main site is deployed and accessible')
    } else {
      console.log('❌ Main site deployment issue')
    }
  } catch (error) {
    console.log('❌ Failed to reach main site:', error.message)
  }
}

// Check functions directory structure
import fs from 'fs'
import path from 'path'

console.log('Checking functions directory structure...')
const functionsDir = './netlify/functions'

if (fs.existsSync(functionsDir)) {
  console.log('✅ netlify/functions directory exists')
  const files = fs.readdirSync(functionsDir)
  console.log('Functions found:', files)
  
  if (files.includes('send-email.js')) {
    console.log('✅ send-email.js function exists')
    
    // Check file content
    const filePath = path.join(functionsDir, 'send-email.js')
    const content = fs.readFileSync(filePath, 'utf8')
    
    if (content.includes('exports.handler')) {
      console.log('✅ Function has proper handler export')
    } else {
      console.log('❌ Function missing handler export')
    }
    
    if (content.includes('googleapis')) {
      console.log('✅ Function includes Gmail API dependency')
    } else {
      console.log('❌ Function missing Gmail API dependency')
    }
  } else {
    console.log('❌ send-email.js function not found')
  }
} else {
  console.log('❌ netlify/functions directory not found')
}

// Check package.json for dependencies
console.log('\nChecking package.json dependencies...')
if (fs.existsSync('./package.json')) {
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
  
  if (deps.googleapis) {
    console.log('✅ googleapis dependency found')
  } else {
    console.log('❌ googleapis dependency missing')
  }
} else {
  console.log('❌ package.json not found')
}

await checkDeployment()

console.log('\n📋 Deployment Check Complete')
console.log('If functions are not working, try:')
console.log('1. npm install googleapis')
console.log('2. git add . && git commit -m "Add googleapis dependency"')
console.log('3. git push origin main')
console.log('4. Check Netlify dashboard for build logs')
