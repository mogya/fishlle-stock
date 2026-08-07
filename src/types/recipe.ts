export type Recipe = {
  title: string
  url: string
}

export type RecipeProduct = {
  name: string
  aliases: string[]
  recipes: Recipe[]
}

export type RecipesData = {
  generatedAt: string
  products: RecipeProduct[]
}
