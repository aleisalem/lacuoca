"""
Unit conversion service.
Converts recipe ingredient quantities between metric and imperial units
using the Pint library.  Only operates on recognised units; unknown units
are left unchanged so the recipe always stays readable.
"""
from __future__ import annotations

import copy
from typing import TYPE_CHECKING

from pint import UnitRegistry, errors as pint_errors

if TYPE_CHECKING:
    from app.models.recipe import Recipe

ureg = UnitRegistry()
ureg.define("tbsp = 14.7868 ml")
ureg.define("tsp  =  4.9289 ml")
ureg.define("cup  = 236.588 ml")

# Map common aliases written in recipes to pint unit names
ALIAS_MAP = {
    # metric
    "g": "gram", "kg": "kilogram",
    "ml": "milliliter", "l": "liter", "dl": "deciliter", "cl": "centiliter",
    # imperial/us
    "oz": "ounce", "lb": "pound",
    "tbsp": "tbsp", "tsp": "tsp",
    "tablespoon": "tbsp", "teaspoon": "tsp",
    "cup": "cup", "cups": "cup",
    # German aliases
    "gramm": "gram", "kilogramm": "kilogram",
    "milliliter": "milliliter", "liter": "liter",
    "esslöffel": "tbsp", "teelöffel": "tsp", "tasse": "cup",
}

# Target units per dimensionality per system
METRIC_TARGETS = {
    "mass": "g",
    "volume": "ml",
}
IMPERIAL_TARGETS = {
    "mass": "oz",
    "volume": "cup",
}


def _convert_quantity(quantity: float, unit_str: str, target_system: str) -> tuple[float, str]:
    """Convert a quantity+unit to the target system.  Returns (new_qty, new_unit)."""
    pint_unit = ALIAS_MAP.get(unit_str.lower())
    if not pint_unit:
        return quantity, unit_str

    try:
        q = quantity * ureg(pint_unit)
        dim = str(q.dimensionality)

        targets = METRIC_TARGETS if target_system == "metric" else IMPERIAL_TARGETS

        if "[mass]" in dim:
            target = targets["mass"]
        elif "[length]" in dim:  # pint represents volume as [length]^3
            target = targets["volume"]
        else:
            return quantity, unit_str

        converted = q.to(target)
        new_qty = round(float(converted.magnitude), 2)
        return new_qty, target
    except (pint_errors.DimensionalityError, pint_errors.UndefinedUnitError):
        return quantity, unit_str


def convert_recipe_units(recipe: "Recipe", target_system: str, **extra) -> "Recipe":
    """
    Return a shallow copy of the recipe with ingredient quantities converted
    to target_system ('metric' or 'imperial').  Does not touch the database.
    """
    if target_system not in ("metric", "imperial"):
        return recipe

    # We do NOT mutate the ORM object; return a proxy with converted values
    # by monkey-patching copies of ingredients.
    converted_ingredients = []
    for ing in recipe.ingredients:
        if ing.quantity is not None and ing.unit:
            new_qty, new_unit = _convert_quantity(ing.quantity, ing.unit, target_system)
            # Create a lightweight data container that looks like the ORM object
            ing_copy = type(
                "Ingredient",
                (),
                {**{c.key: getattr(ing, c.key) for c in ing.__table__.columns},
                 "quantity": new_qty, "unit": new_unit},
            )()
        else:
            ing_copy = ing
        converted_ingredients.append(ing_copy)

    # Wrap recipe — only copy column values and the already-loaded relationships
    # (ingredients, steps). Do NOT touch owner/shares — they trigger lazy loads
    # after the async session has closed.
    recipe_proxy = type(
        "Recipe",
        (),
        {
            **{c.key: getattr(recipe, c.key) for c in recipe.__table__.columns},
            "ingredients": converted_ingredients,
            "steps": recipe.steps,
            **extra,
        },
    )()
    return recipe_proxy
