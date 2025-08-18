# Meal Plan Template System Migration Guide

## Overview
We've restructured the meal plan system to eliminate duplication issues and provide a cleaner, more scalable architecture. The new system uses **immutable master templates** with **personal client copies** that can be edited independently.

## What Changed

### Database Structure
- **New Table**: `meal_plan_instances` - Links clients to templates with personal meal data
- **New View**: `meal_plans_with_templates` - Easy querying of client plans
- **New Functions**: Clean template copying, personal meal retrieval, and personal meal updates
- **Eliminated**: The messy `template_id` approach that caused duplication

### Key Benefits
1. **No More Duplicates**: Master templates are immutable, clients get personal copies
2. **Clean Data**: Clear separation between templates and client instances
3. **Scalable**: Multiple clients can use the same template efficiently
4. **Maintainable**: Each client has their own editable copy
5. **Template Reusability**: Master templates can be reused without affecting existing clients

## How the New System Works

### 🏗️ **Immutable Master Templates**
- **Master templates are NEVER changed** - they serve as the blueprint
- **Templates are reusable** - multiple clients can use the same template
- **Template data is stored once** - no duplication in the database

### 👤 **Personal Client Copies**
- **Each client gets their own copy** of the template meals/foods
- **Client copies are stored in JSONB** - easy to edit and maintain
- **Edits only affect the client's copy** - never the master template
- **No more delete/recreate cycles** - updates are clean and efficient

## New Database Functions

### 1. Copy Template to Client
```sql
SELECT copy_template_to_client(
  template_id,    -- UUID of the master template
  client_id,      -- UUID of the client
  coach_id        -- UUID of the coach
);
```

### 2. Get Client's Personal Meals
```sql
SELECT * FROM get_client_personal_meals(
  instance_id,    -- UUID from meal_plan_instances
  user_id         -- UUID of the requesting user
);
```

### 3. Update Client's Personal Meals
```sql
SELECT update_client_meals(
  instance_id,    -- UUID from meal_plan_instances
  user_id,        -- UUID of the requesting user
  new_meals_json  -- JSONB array of new meals
);
```

## Frontend Migration Steps

### Step 1: Update Meal Plan Creation
**Old Code** (caused duplication):
```typescript
// This created duplicate meals every time
const { data: newPlan } = await supabase
  .from("meal_plans")
  .insert({
    user_id: client.id,
    title: template.title,
    description: template.description,
    is_active: false,
    is_template: false,
    template_id: templateId  // This caused the problem
  });
```

**New Code** (clean instances with personal copies):
```typescript
// Create instance with personal copy using the new function
const { data: instanceId } = await supabase.rpc('copy_template_to_client', {
  template_id_param: templateId,
  client_id_param: client.id,
  coach_id_param: coachId
});
```

### Step 2: Update Meal Plan Loading
**Old Code** (complex joins):
```typescript
// Complex query that could return duplicates
const { data: meals } = await supabase
  .from("meals")
  .select("*, foods(*)")
  .eq("meal_plan_id", planId);
```

**New Code** (clean personal meals):
```typescript
// Clean, personal meals from the client's copy
const { data: meals } = await supabase.rpc('get_client_personal_meals', {
  instance_id_param: instanceId,
  user_id_param: userId
});
```

### Step 3: Update Meal Plan Editing
**Old Code** (delete + recreate = duplication):
```typescript
// This caused the duplication problem
// Delete old meals/foods
await supabase.from("meals").delete().eq("meal_plan_id", planId);

// Insert new meals/foods
for (const meal of newMeals) {
  // ... create new meals
}
```

**New Code** (update personal copy only):
```typescript
// Update the client's personal copy, never affects the master template
await supabase.rpc('update_client_meals', {
  instance_id_param: instanceId,
  user_id_param: userId,
  new_meals_json: newMeals
});
```

## Updated API Endpoints

### Create Meal Plan from Template
```typescript
// POST /api/meal-plans/use-template
export const action = async ({ request, params }) => {
  const { templateId, clientId } = await request.json();
  
  // Use new function to create personal copy
  const { data: instanceId } = await supabase.rpc('copy_template_to_client', {
    template_id_param: templateId,
    client_id_param: clientId,
    coach_id_param: coachId
  });
  
  return json({ instanceId });
};
```

### Get Client's Personal Meals
```typescript
// GET /api/meal-plans/:instanceId/meals
export const loader = async ({ params }) => {
  const { instanceId } = params;
  
  // Use new function for personal meals
  const { data: meals } = await supabase.rpc('get_client_personal_meals', {
    instance_id_param: instanceId,
    user_id_param: userId
  });
  
  return json({ meals });
};
```

### Update Client's Personal Meals
```typescript
// PUT /api/meal-plans/:instanceId
export const action = async ({ request, params }) => {
  const { instanceId } = params;
  const { meals } = await request.json();
  
  // Update personal copy using new function
  await supabase.rpc('update_client_meals', {
    instance_id_param: instanceId,
    user_id_param: userId,
    new_meals_json: meals
  });
  
  return json({ success: true });
};
```

## Data Migration

### Existing Data
- ✅ **Migrated**: All existing template relationships moved to `meal_plan_instances`
- ✅ **Preserved**: All meal completion history maintained
- ✅ **Clean**: Jake's duplicated meals have been cleaned up
- ✅ **Personal Copies**: Jake now has his own personal copy of the template

### New Data Flow
1. **Coach creates template** → Stored in `meal_plans` with `is_template = true`
2. **Coach assigns to client** → Creates record in `meal_plan_instances` with personal copy
3. **Client views meals** → Reads from their personal copy via `get_client_personal_meals()`
4. **Coach edits client plan** → Updates client's personal copy, never affects template
5. **Template remains unchanged** → Can be reused for other clients

## Testing the New System

### Verify Jake's Plan is Clean
```sql
-- Should return exactly 4 meals with foods from his personal copy
SELECT * FROM get_client_personal_meals(
  (SELECT id FROM meal_plan_instances WHERE client_id = '08ae5027-166b-438f-9e62-74c07756e720'),
  '08ae5027-166b-438f-9e62-74c07756e720'
);
```

### Test Template Copying
```sql
-- Create new instance for testing
SELECT copy_template_to_client(
  '93ad7745-a5c0-46f0-b8c9-67d3c8d3e32a', -- Jake's template
  'test-client-id',
  'coach-id'
);
```

### Test Personal Meal Updates
```sql
-- Update a client's personal meals
SELECT update_client_meals(
  'instance-id',
  'user-id',
  'new-meals-json'
);
```

## Key Differences from Old System

| Old System | New System |
|------------|------------|
| Templates copied to client tables | Templates remain in place, clients get personal copies |
| Edit = Delete + Recreate | Edit = Update personal copy |
| Duplication on every edit | No duplication, clean updates |
| Complex joins to get meals | Simple function calls |
| Hard to maintain | Easy to maintain and scale |

## Rollback Plan

If issues arise, the old system is still intact:
- **Old tables**: `meal_plans` with `template_id` still exist
- **Old data**: All meal completion history preserved
- **Fallback**: Can temporarily revert to old queries while debugging

## Next Steps

1. **Update Frontend**: Migrate API calls to use new functions
2. **Test Thoroughly**: Verify all meal plan operations work correctly
3. **Monitor Performance**: Ensure new queries are efficient
4. **Clean Up**: Remove old template_id logic once migration is complete

## Questions?

The new system is designed to be:
- **Simple**: Clear separation between templates and personal copies
- **Efficient**: No duplicate data storage
- **Scalable**: Easy to add more clients per template
- **Maintainable**: Each client has their own editable copy
- **Template-Friendly**: Master templates are reusable and never change

This should eliminate the meal duplication issues we saw with Jake's plan and provide a much cleaner foundation for future development. Each client gets their own personal copy that can be edited independently without affecting the master template or other clients.
