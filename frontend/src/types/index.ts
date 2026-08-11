export type UserRole = "admin" | "user";
export type UnitSystem = "metric" | "imperial";
export type RecipeCategory =
  | "breakfast" | "lunch" | "dinner" | "dessert"
  | "snack" | "drink" | "soup" | "salad" | "bread" | "other";
export type SharePermission = "read" | "edit";

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  totp_enabled: boolean;
  unit_system: UnitSystem;
  preferred_language: string;
  created_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  order: number;
  notes: string | null;
}

export interface Step {
  id: string;
  order: number;
  description: string;
  duration_minutes: number | null;
}

export interface Recipe {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: RecipeCategory;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  image_path: string | null;
  source_language: string;
  is_public: boolean;
  is_draft: boolean;
  tags: string | null;
  is_ai_generated: boolean;
  ai_model_used: string | null;
  is_favorite: boolean;
  ingredients: Ingredient[];
  steps: Step[];
  created_at: string;
  updated_at: string;
  my_permission: "owner" | "read" | "edit";
  shared_by_username: string | null;
}

export interface RecipeListItem
  extends Omit<Recipe, "ingredients" | "steps"> {}

export interface RecipeShare {
  id: string;
  recipe_id: string;
  shared_with_id: string;
  shared_by_id: string | null;
  permission: SharePermission;
  seen_at: string | null;
  created_at: string;
}

export interface NewShareNotification {
  share_id: string;
  recipe_id: string;
  recipe_title: string;
  shared_by_username: string;
  permission: SharePermission;
  created_at: string;
}

export interface SignupRequest {
  id: string;
  username: string;
  email: string;
  message: string | null;
  status: string;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  model?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  requires_totp: boolean;
}
