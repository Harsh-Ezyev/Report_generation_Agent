# Authentication Setup Guide

## Overview

The application now includes authentication using NextAuth.js. Users must log in before accessing the dashboard or inventory pages.

## Default Credentials

- **Username**: `admin`
- **Password**: `admin123`

## Configuration

### Environment Variables

Add these to your `.env.local` file:

```env
# Authentication (optional - defaults shown)
AUTH_USERNAME=admin
AUTH_PASSWORD=admin123
NEXTAUTH_SECRET=your-secret-key-change-in-production-min-32-chars
NEXTAUTH_URL=http://localhost:3000
```

### For Production (Vercel)

When deploying to Vercel, add these environment variables in your project settings:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - `AUTH_USERNAME` (your desired username)
   - `AUTH_PASSWORD` (your desired password)
   - `NEXTAUTH_SECRET` (generate a secure random string, minimum 32 characters)
   - `NEXTAUTH_URL` (your production URL, e.g., `https://your-app.vercel.app`)

### Generate NEXTAUTH_SECRET

You can generate a secure secret using:

```bash
openssl rand -base64 32
```

Or use an online generator: https://generate-secret.vercel.app/32

## Features

### Protected Routes

All routes except `/login` are protected. Unauthenticated users are automatically redirected to the login page.

### Session Management

- Sessions last 24 hours
- Uses JWT (JSON Web Tokens) for session storage
- Sessions persist across page refreshes

### Logout

Users can logout using the "Logout" button in the header of:
- Dashboard page
- Inventory Management page

## Security Notes

### Production Recommendations

1. **Change Default Credentials**: Always change the default username and password in production
2. **Use Strong Passwords**: Use complex passwords stored in environment variables
3. **Secure NEXTAUTH_SECRET**: Generate a strong, random secret (minimum 32 characters)
4. **Use HTTPS**: Always use HTTPS in production (Vercel provides this automatically)
5. **Database Authentication**: Consider storing user credentials in a database with bcrypt hashing

### Current Implementation

The current implementation uses:
- Simple username/password comparison
- Environment variables for credentials
- JWT sessions

For enhanced security, you can:
- Store credentials in a database
- Use bcrypt for password hashing
- Implement password reset functionality
- Add multi-factor authentication (MFA)
- Implement role-based access control (RBAC)

## Troubleshooting

### "Invalid username or password" Error

1. Check that `.env.local` has the correct `AUTH_USERNAME` and `AUTH_PASSWORD`
2. Verify you're using the correct credentials
3. Restart the development server after changing environment variables

### Redirect Loop

1. Ensure `NEXTAUTH_URL` matches your application URL
2. Check that middleware is correctly configured
3. Verify session cookies are being set

### Session Not Persisting

1. Check browser cookies are enabled
2. Verify `NEXTAUTH_SECRET` is set
3. Ensure you're not in incognito/private browsing mode

## API Routes

### Authentication Endpoints

- `POST /api/auth/signin` - Sign in with credentials
- `POST /api/auth/signout` - Sign out current user
- `GET /api/auth/session` - Get current session
- `GET /api/auth/csrf` - Get CSRF token

These are handled automatically by NextAuth.js.

## Customization

### Change Login Page

Edit `app/login/page.tsx` to customize the login page appearance.

### Change Session Duration

Edit `app/api/auth/[...nextauth]/route.ts` and modify:
```typescript
session: {
  strategy: "jwt",
  maxAge: 24 * 60 * 60, // Change this value (in seconds)
},
```

### Add More Users

Currently, authentication uses a single user. To add multiple users:

1. Store users in a database
2. Modify the `authorize` function in `app/api/auth/[...nextauth]/route.ts`
3. Query the database to verify credentials

## Support

For issues or questions about authentication:
1. Check this documentation
2. Review NextAuth.js documentation: https://next-auth.js.org
3. Check environment variables are set correctly
4. Review browser console for errors

