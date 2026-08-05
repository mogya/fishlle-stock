import { parseHTML } from 'linkedom'
import { writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

const BASE_URL = 'https://fishlle.com'
const VARIATION_URL = `${BASE_URL}/shop/product_categories/variation`
const OUTPUT_PATH = 'public/recipes.json'
const DELAY_MS = 400

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

  const items = Array.from(document.querySelectorAll('li'))
    .map((li) => {
      const link = li.querySelector('a[href^="/shop/products/recipe-"]')
      const titleEl = li.querySelector('.recipe-name')
      const flavorEl = li.querySelector('.flavoring__label')
      if (!link || !titleEl || !flavorEl) return null

      const href = link.getAttribute('href')
      const title = titleEl.textContent.trim()
      const flavor = flavorEl.textContent.trim()
      if (!href || !title || !flavor) return null

      return {
        title,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        flavor,
      }
    })
    .filter(Boolean)

  const flavors = [...new Set(items.map((i) => i.flavor))]
  if (flavors.length !== 1) {
    return null
  }

  return {
    name: productName || flavors[0],
    recipes: items.map((i) => ({ title: i.title, url: i.url })),
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
      if (product && product.recipes.length > 0) {
        products.push(product)
      } else {
        console.warn(`Skipped ${url}: not a single-flavor category`)
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
