# API Routes

This directory contains all API-related routes for the Kava Training application.

## Structure

- `_index.tsx`: Documentation page that describes all available API endpoints
- Individual API routes are named for their function (e.g., `invite-client.tsx`)

## Best Practices

1. **Naming Convention**: Use kebab-case for API route names (e.g., `user-profile.tsx`, `update-settings.tsx`)

2. **Response Format**: All API responses should follow a consistent structure:

   ```typescript
   {
     success: boolean;          // Whether the operation succeeded
     data?: any;                // Optional data returned from the operation
     error?: string;            // Error message if success is false
     message?: string;          // Optional success message
   }
   ```

3. **Status Codes**:

   - 200: Success
   - 400: Bad Request (client error, validation error)
   - 401: Unauthorized (not authenticated)
   - 403: Forbidden (authenticated but not authorized)
   - 404: Not Found
   - 500: Server Error

4. **Validation**: Always validate inputs before processing

5. **Error Handling**: Always use try/catch blocks and return appropriate error responses

6. **Documentation**: Add each new API endpoint to the `_index.tsx` file

7. **Authentication**: Most API routes should include authentication checks

## Adding a New API Route

To add a new API route:

1. Create a new file in this directory (e.g., `my-api-function.tsx`)
2. Implement the route using the action or loader function
3. Update the API documentation in `_index.tsx`
4. Update any TypeScript interfaces if needed
