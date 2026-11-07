import data from '../../content/data/料理採集篩選.json';

export const gatheringRecipes = data.recipes;
export const findGatheringRecipe = (name: string) => gatheringRecipes.find(recipe => recipe.name === name);
export function recipeGatheringHref(name: string, dataset?: string): string {
  const recipe = findGatheringRecipe(name);
  const target = dataset ? recipe?.targets.find(target => target.dataset === dataset) : recipe?.targets[0];
  return `${target?.href ?? '/採集/狩獵/'}?recipe=${encodeURIComponent(name)}`;
}
/** 只比對材料名稱，不能以文字搜尋誤中地點附註中的副產物。 */
export function recipeGatheringItems(name: string, dataset: string): Set<string> | null {
  if (!name) return null;
  return new Set(findGatheringRecipe(name)?.targets.find(target => target.dataset === dataset)?.items ?? []);
}
