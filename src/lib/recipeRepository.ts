import type { RecipeProduct, RecipesData } from '../types/recipe'

const RECIPES_URL = '/recipes.json'

export async function loadRecipes(): Promise<RecipesData> {
  const response = await fetch(RECIPES_URL)
  if (!response.ok) {
    throw new Error(`Failed to load recipes: ${response.status}`)
  }
  return response.json() as Promise<RecipesData>
}

export function findRecipeProduct(
  itemName: string,
  recipeProducts: RecipeProduct[],
): RecipeProduct | null {
  const normalized = itemName.replace(/\s*[（(].*?[）)]\s*$/, '').trim()
  const matched = recipeProducts
    .filter((p) => normalized.startsWith(p.name))
    .sort((a, b) => b.name.length - a.name.length)[0]
  return matched ?? null
}
