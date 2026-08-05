import type { RecipeProduct, RecipesData } from '../types/recipe'

const RECIPES_URL = '/recipes.json'

export async function loadRecipes(): Promise<RecipesData> {
  const response = await fetch(RECIPES_URL)
  if (!response.ok) {
    throw new Error(`Failed to load recipes: ${response.status}`)
  }
  return response.json() as Promise<RecipesData>
}

function normalizeForMatch(value: string): string {
  return value.normalize('NFKC').trim()
}

function removeTrailingParenthetical(value: string): string {
  return value.replace(/\s*[（(].*?[）)]\s*$/, '').trim()
}

function hasBoundaryAfter(value: string, prefix: string): boolean {
  if (value === prefix) return true
  const next = value[prefix.length]
  return /\s|[（(]/.test(next)
}

function productMatches(itemName: string, candidate: string): boolean {
  const normalizedItem = removeTrailingParenthetical(normalizeForMatch(itemName))
  const normalizedCandidate = normalizeForMatch(candidate)

  if (normalizedItem === normalizedCandidate) return true
  if (!normalizedItem.startsWith(normalizedCandidate)) return false
  return hasBoundaryAfter(normalizedItem, normalizedCandidate)
}

export function findRecipeProduct(
  itemName: string,
  recipeProducts: RecipeProduct[],
): RecipeProduct | null {
  let best: { product: RecipeProduct; candidateLength: number } | null = null

  for (const product of recipeProducts) {
    const candidates = [product.name, ...product.aliases]
    const uniqueCandidates = [...new Set(candidates)]

    for (const candidate of uniqueCandidates) {
      if (productMatches(itemName, candidate)) {
        const candidateLength = candidate.normalize('NFKC').trim().length
        if (!best || candidateLength > best.candidateLength) {
          best = { product, candidateLength }
        }
      }
    }
  }

  return best?.product ?? null
}
