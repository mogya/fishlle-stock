import { describe, expect, it } from 'vitest'
import { findRecipeProduct } from './recipeRepository'
import type { RecipeProduct } from '../types/recipe'

function product(name: string, aliases: string[] = [], recipesCount = 1): RecipeProduct {
  return {
    name,
    aliases,
    recipes: Array.from({ length: recipesCount }, (_, i) => ({
      title: `${name} recipe ${i + 1}`,
      url: `https://example.com/${name}-${i + 1}`,
    })),
  }
}

const products: RecipeProduct[] = [
  product('ジェノバソース'),
  product('和風白ごま'),
  product('ハーブオイルコンフィ'),
  product('ハーブオイルマリネ'),
  product('塩麴漬け', ['塩麹漬け']),
  product('ユッケ'),
]

describe('findRecipeProduct', () => {
  it('matches an exact product name', () => {
    expect(findRecipeProduct('ジェノバソース', products)?.name).toBe('ジェノバソース')
  })

  it('matches a product name with a parenthetical suffix', () => {
    expect(findRecipeProduct('ジェノバソース（加熱用）', products)?.name).toBe('ジェノバソース')
    expect(findRecipeProduct('ジェノバソース(生食用)', products)?.name).toBe('ジェノバソース')
  })

  it('prefers the longest prefix match', () => {
    expect(findRecipeProduct('ハーブオイルマリネ（生食用）', products)?.name).toBe('ハーブオイルマリネ')
    expect(findRecipeProduct('ハーブオイルコンフィ（加熱用）', products)?.name).toBe('ハーブオイルコンフィ')
  })

  it('matches an alias (variant kanji)', () => {
    expect(findRecipeProduct('塩麹漬け（加熱用）', products)?.name).toBe('塩麴漬け')
  })

  it('does not match partial boundaries', () => {
    expect(findRecipeProduct('ユッケの卵かけご飯', products)).toBeNull()
    expect(findRecipeProduct('ジェノバソースパスタ', products)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(findRecipeProduct('さば', products)).toBeNull()
  })
})
