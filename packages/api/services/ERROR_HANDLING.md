# Service Layer Error Handling Pattern

## Established Pattern

### 1. Validation Errors - Re-throw Unchanged
**Rationale**: Validation errors (Zod errors, constraint violations) contain user-friendly messages that should reach the client directly.

```typescript
try {
  const validatedData = schema.parse(data);
} catch (error) {
  // Let Zod errors bubble up unchanged - route handles them
  throw error;
}
```

**Route Layer Handling**:
```typescript
if (error instanceof ZodError) {
  return res.status(400).json({ message: "Invalid input", errors: error.errors });
}
```

### 2. Database Errors - Wrap with Context
**Rationale**: Database errors expose implementation details. Wrap them with business-context messages.

```typescript
try {
  const [updated] = await db.update(table).set(data).where(eq(table.id, id));
  if (!updated) throw new Error('Team not found');
  return updated;
} catch (error) {
  // Don't expose "foreign key constraint violation" - say "Team has measurements"
  throw new Error('Cannot delete team with existing measurements');
}
```

### 3. Business Logic Errors - Throw Descriptive Errors
**Rationale**: Business rule violations should have clear, actionable messages.

```typescript
if (existingMeasurement.isVerified && user.role === 'athlete') {
  throw new Error('Cannot modify verified measurements. Contact your coach.');
}
```

### 4. HTTP Status Mapping (Route Layer)
**Rationale**: Services throw Error objects; routes map to HTTP status codes.

```typescript
catch (error) {
  const message = error instanceof Error ? error.message : "Failed to update";
  const statusCode = message.includes("not found") ? 404 : 500;
  res.status(statusCode).json({ message });
}
```

## Examples by Service

### TeamService
- ✅ `updateTeam()` - Wraps "no valid fields" with context
- ✅ `deleteTeam()` - Checks for measurements, throws business error
- ✅ `archiveTeam()` - Throws "Team not found" (business context)

### MeasurementService
- ✅ `createMeasurement()` - Re-throws Zod validation errors unchanged
- ✅ `updateMeasurement()` - Validates submittedBy immutability, throws descriptive error
- ⚠️  Mixed: Some methods wrap DB errors, others re-throw unchanged

### OrganizationService
- ✅ `deactivateOrganization()` - Throws "Organization not found" (business context)
- ✅ `deleteOrganization()` - Validates confirmation, throws business errors

## Recommendations

1. **Always preserve error types** for proper HTTP status mapping
2. **Business errors should be actionable** - tell users what they can do
3. **Database errors should be abstracted** - never expose SQL/table names
4. **Let validation libraries do their job** - don't wrap Zod errors

## Future Improvements

Consider creating custom error classes:
```typescript
class NotFoundError extends Error { statusCode = 404; }
class ValidationError extends Error { statusCode = 400; }
class ForbiddenError extends Error { statusCode = 403; }
```

This would allow route handlers to simply:
```typescript
catch (error) {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({ message: error.message });
}
```
