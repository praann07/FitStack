import type { Food } from '@/types'

/**
 * System food library (per 100 g, like the `foods` table). Values are rounded
 * real-world figures for common staples a lifter tracking macros actually eats.
 */
type Seed = [
  id: string,
  name: string,
  brand: string | null,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  servingLabel: string | null,
  servingG: number | null,
]

const SEEDS: Seed[] = [
  // Protein sources
  ['fd-chicken-breast', 'Chicken Breast, grilled', null, 165, 31, 0, 3.6, '1 breast (150 g)', 150],
  ['fd-chicken-thigh', 'Chicken Thigh, skinless', null, 179, 24.8, 0, 8.2, '1 thigh (95 g)', 95],
  ['fd-lean-beef-mince', 'Beef Mince 5% fat', null, 137, 21.5, 0, 5, 'Portion (200 g)', 200],
  ['fd-salmon', 'Salmon Fillet', null, 208, 20.4, 0, 13.4, '1 fillet (130 g)', 130],
  ['fd-cod', 'Cod Fillet', null, 82, 17.8, 0, 0.7, '1 fillet (150 g)', 150],
  ['fd-tuna-tin', 'Tuna in Spring Water', 'John West', 109, 25.5, 0, 0.6, '1 tin (112 g)', 112],
  ['fd-eggs', 'Whole Egg', null, 143, 12.6, 0.7, 9.5, '1 large egg (58 g)', 58],
  ['fd-egg-white', 'Egg White', null, 52, 10.9, 0.7, 0.2, '1 white (33 g)', 33],
  ['fd-turkey-mince', 'Turkey Mince 2% fat', null, 116, 24, 0, 2, 'Portion (200 g)', 200],
  ['fd-whey', 'Whey Protein Isolate', 'Bulk', 373, 82, 4.5, 2.5, '1 scoop (30 g)', 30],
  ['fd-casein', 'Micellar Casein', 'MyProtein', 358, 78, 4, 2, '1 scoop (30 g)', 30],
  ['fd-greek-yogurt', 'Greek Yogurt 0%', 'Fage', 57, 10.3, 3.6, 0.2, 'Pot (170 g)', 170],
  ['fd-cottage-cheese', 'Cottage Cheese', null, 98, 11.1, 3.4, 4.3, 'Portion (200 g)', 200],
  ['fd-tofu', 'Firm Tofu', null, 144, 15.8, 2.8, 8.7, 'Block (200 g)', 200],
  ['fd-prawns', 'King Prawns, cooked', null, 99, 20.9, 0.2, 1.4, 'Portion (150 g)', 150],

  // Carb sources
  ['fd-white-rice', 'White Rice, cooked', null, 130, 2.7, 28.2, 0.3, 'Portion (200 g)', 200],
  ['fd-basmati-rice', 'Basmati Rice, cooked', null, 121, 3.5, 25.2, 0.4, 'Portion (200 g)', 200],
  ['fd-jasmine-rice', 'Jasmine Rice, cooked', null, 129, 2.9, 28, 0.3, 'Portion (200 g)', 200],
  ['fd-oats', 'Rolled Oats, dry', null, 379, 13.2, 67.7, 6.5, 'Serving (80 g)', 80],
  ['fd-sweet-potato', 'Sweet Potato, baked', null, 90, 2, 20.7, 0.2, '1 medium (150 g)', 150],
  ['fd-potato', 'White Potato, boiled', null, 87, 1.9, 20.1, 0.1, 'Portion (250 g)', 250],
  ['fd-pasta', 'Pasta, cooked', null, 158, 5.8, 30.9, 0.9, 'Portion (250 g)', 250],
  ['fd-sourdough', 'Sourdough Bread', null, 246, 9.8, 47.2, 1.7, '1 slice (55 g)', 55],
  ['fd-wholemeal-bread', 'Wholemeal Bread', 'Hovis', 236, 10.5, 39.2, 2.7, '1 slice (44 g)', 44],
  ['fd-bagel', 'Plain Bagel', null, 275, 11, 52, 1.6, '1 bagel (85 g)', 85],
  ['fd-banana', 'Banana', null, 89, 1.1, 22.8, 0.3, '1 medium (118 g)', 118],
  ['fd-apple', 'Apple', null, 52, 0.3, 13.8, 0.2, '1 medium (180 g)', 180],
  ['fd-blueberries', 'Blueberries', null, 57, 0.7, 14.5, 0.3, 'Handful (80 g)', 80],
  ['fd-honey', 'Honey', null, 304, 0.3, 82.4, 0, '1 tbsp (21 g)', 21],
  ['fd-rice-cakes', 'Rice Cakes', 'Kallo', 387, 8.2, 81.1, 3.1, '1 cake (8 g)', 8],

  // Fats
  ['fd-olive-oil', 'Olive Oil', null, 884, 0, 0, 100, '1 tbsp (14 g)', 14],
  ['fd-peanut-butter', 'Peanut Butter, smooth', 'Meridian', 606, 27, 12.5, 50, '1 tbsp (16 g)', 16],
  ['fd-almonds', 'Almonds', null, 579, 21.2, 21.6, 49.9, 'Handful (30 g)', 30],
  ['fd-avocado', 'Avocado', null, 160, 2, 8.5, 14.7, 'Half (100 g)', 100],
  ['fd-cheddar', 'Cheddar Cheese', null, 402, 25, 1.3, 33.1, 'Slice (30 g)', 30],
  ['fd-dark-chocolate', 'Dark Chocolate 85%', 'Lindt', 592, 10, 19, 51, '2 squares (20 g)', 20],

  // Vegetables & misc
  ['fd-broccoli', 'Broccoli, steamed', null, 35, 2.4, 7.2, 0.4, 'Portion (150 g)', 150],
  ['fd-spinach', 'Spinach', null, 23, 2.9, 3.6, 0.4, 'Handful (50 g)', 50],
  ['fd-mixed-veg', 'Mixed Vegetables', null, 45, 2.3, 8.1, 0.4, 'Portion (200 g)', 200],
  ['fd-milk-semi', 'Semi-Skimmed Milk', null, 50, 3.6, 4.8, 1.8, 'Glass (250 g)', 250],
  ['fd-oat-milk', 'Oat Milk, barista', 'Oatly', 59, 1, 6.7, 3, 'Glass (250 g)', 250],
  ['fd-protein-bar', 'Protein Bar, cookie dough', 'Grenade', 388, 34, 33, 15, '1 bar (60 g)', 60],
  ['fd-ketchup', 'Tomato Ketchup', 'Heinz', 102, 1.2, 23.2, 0.1, '1 tbsp (15 g)', 15],
]

export const SYSTEM_FOODS: Food[] = SEEDS.map(
  ([
    id,
    name,
    brand,
    calories_per_100g,
    protein_per_100g,
    carbs_per_100g,
    fat_per_100g,
    serving_label,
    serving_g,
  ]) => ({
    id,
    name,
    brand,
    calories_per_100g,
    protein_per_100g,
    carbs_per_100g,
    fat_per_100g,
    serving_label,
    serving_g,
    is_custom: false,
    created_by: null,
  }),
)
