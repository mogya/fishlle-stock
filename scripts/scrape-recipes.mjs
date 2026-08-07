import { parseHTML } from 'linkedom'
import { writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'https://fishlle.com'
const VARIATION_URL = `${BASE_URL}/shop/product_categories/variation`
const OUTPUT_PATH = fileURLToPath(new URL('../public/recipes.json', import.meta.url))
const DELAY_MS = 400
const MAX_FLAVORS = 3

async function fetchHTML(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; fishlle-stock/1.0)',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.text()
}

function parseVariationPage(html) {
  const { document } = parseHTML(html)

  const headings = Array.from(document.querySelectorAll('h2'))
  const flavorHeading = headings.find((h) => h.textContent.includes('味付けから探す'))
  if (!flavorHeading) {
    throw new Error('味付けから探す section not found')
  }

  const links = []
  let next = flavorHeading.nextElementSibling
  while (next && next.tagName?.toLowerCase() !== 'h2') {
    if (next.tagName?.toLowerCase() === 'section') {
      const anchors = next.querySelectorAll('a[href^="/shop/product_categories/recipe_"]')
      anchors.forEach((a) => links.push(a.getAttribute('href')))
    }
    next = next.nextElementSibling
  }

  return [...new Set(links)].map((href) => (href.startsWith('http') ? href : `${BASE_URL}${href}`))
}

function parseProductCategoryPage(html) {
  const { document } = parseHTML(html)

  const h1 = document.querySelector('h1')
  const productName = h1?.textContent?.split('レシピ一覧')[0]?.trim()
  if (!productName) {
    return null
  }

  const recipes = []
  const aliases = new Set()

  const items = document.querySelectorAll('.p-product_list__list__item')
  for (const li of items) {
    const link = li.querySelector('a[href^="/shop/products/recipe-"]')
    const titleEl = li.querySelector('.recipe-name')
    const flavorEl = li.querySelector('.flavoring__label')
    if (!link || !titleEl || !flavorEl) continue

    const href = link.getAttribute('href')
    const title = titleEl.textContent.trim()
    const flavor = flavorEl.textContent.trim()
    if (!href || !title || !flavor) continue

    recipes.push({
      title,
      url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
    })
    aliases.add(flavor)
  }

  if (recipes.length === 0) {
    return null
  }

  if (aliases.size > MAX_FLAVORS) {
    console.warn(`Skipping: ${productName} has ${aliases.size} distinct flavors`)
    return null
  }

  return {
    name: productName,
    aliases: [...aliases],
    recipes,
  }
}

async function main() {
  console.log(`Fetching ${VARIATION_URL}`)
  const variationHTML = await fetchHTML(VARIATION_URL)
  const productCategoryURLs = parseVariationPage(variationHTML)
  console.log(`Found ${productCategoryURLs.length} product categories`)

  const products = []
  for (const url of productCategoryURLs) {
    try {
      console.log(`Fetching ${url}`)
      const html = await fetchHTML(url)
      const product = parseProductCategoryPage(html)
      if (product) {
        products.push(product)
      } else {
        console.warn(`Skipped ${url}: no recipes or too many flavors`)
      }
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message)
    }
    await setTimeout(DELAY_MS)
  }

  const output = {
    generatedAt: new Date().toISOString(),
    products,
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2))
  console.log(`Wrote ${products.length} products to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
